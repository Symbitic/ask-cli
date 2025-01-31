import chalk from 'chalk';
import fs from 'fs-extra';
import R from 'ramda';

import stringUtils from '@src/utils/string-utils';
import Messenger from '@src/view/messenger';
import responseParser from '@src/controllers/dialog-controller/simulation-response-parser';
import SkillSimulationController, { ISkillSimulationController } from '@src/controllers/skill-simulation-controller';

const RECORD_FORMAT = 'Please use the format: ".record <fileName>" or ".record <fileName> --append-quit"';

export interface IDialogController extends ISkillSimulationController {
    newSession: any;
};

export default class DialogController extends SkillSimulationController {
    private newSession: any;
    private utteranceCache: string[];

    /**
     * Constructor for DialogModeController.
     * @param {Object} configuration | config object includes information such as skillId, locale, profile, stage.
     */
    constructor(configuration: IDialogController) {
        super(configuration);
        this.newSession = configuration.newSession === false ? configuration.newSession : true;
        this.utteranceCache = [];
    }

    /**
     * Evaluate individual utterance input by the User/replay_file.
     * @param {String} input Utterance by the user sent to Alexa.
     * @param {Object} replView Dialog command's repl view.
     * @param {Function} replCallback
     */
    evaluateUtterance(input: string, replView: any, replCallback: Function) {
        replView.startProgressSpinner('Sending simulation request to Alexa...');
        this.startSkillSimulation(input.trim(), this.newSession, (startErr?: Error, startResponse?: any) => {
            if (startErr) {
                replView.terminateProgressSpinner();
                Messenger.getInstance().error(startErr);
                replCallback();
            } else if (startResponse.statusCode >= 300) {
                replView.terminateProgressSpinner();
                Messenger.getInstance().error(R.view(R.lensPath(['body', 'error', 'message']), startResponse));
                replCallback();
            } else {
                replView.updateProgressSpinner('Waiting for the simulation response...');
                const simulationId = R.view(R.lensPath(['body', 'id']), startResponse);

                this.getSkillSimulationResult(simulationId, (getErr?: Error, getResponse?: any) => {
                    replView.terminateProgressSpinner();
                    if (getErr) {
                        Messenger.getInstance().error(getErr);
                    } else {
                        if (responseParser.shouldEndSession(getResponse.body)) {
                            Messenger.getInstance().info('Session ended');
                            this.clearSession();
                        }
                        const captions = responseParser.getCaption(getResponse.body);
                        captions.forEach((caption: any) => {
                            Messenger.getInstance().info(chalk.yellow.bold('Alexa > ') + caption);
                        });
                    }
                    replCallback();
                });
            }
        });
    }

    /**
     * Registers special commands with the REPL server.
     * @param {Object} dialogReplView dialog command's repl view.
     * @param {Function} callback
     */
    setupSpecialCommands(dialogReplView: any, callback: Function) {
        dialogReplView.registerRecordCommand((recordArgs: string) => {
            const recordArgsList = recordArgs.trim().split(' ');
            if (!stringUtils.isNonBlankString(recordArgs) || recordArgsList.length > 2) {
                return Messenger.getInstance().warn(`Incorrect format. ${RECORD_FORMAT}`);
            }
            const { filePath, shouldAppendQuit } = this._validateRecordCommandInput(recordArgsList, RECORD_FORMAT);
            const utteranceCacheCopy = [...this.utteranceCache];
            if (shouldAppendQuit) {
                utteranceCacheCopy.push('.quit');
            }
            if (filePath) {
                try {
                    this.createReplayFile(filePath, utteranceCacheCopy);
                    Messenger.getInstance().info(`Created replay file at ${filePath}`
                        + `${shouldAppendQuit ? ' (appended ".quit" to list of utterances).' : ''}`);
                } catch (replayFileCreationError) {
                    return callback(replayFileCreationError);
                }
            }
        });
        const self = this;
        dialogReplView.registerQuitCommand(() => {
            self._skillIOInstance.save();
        });
    }

    /**
     * Validate record command arguments.
     * @param {Array} recordArgsList
     * @param {String} recordCommandFormat
     */
    _validateRecordCommandInput(recordArgsList: string[], recordCommandFormat: string) {
        const filePath = recordArgsList[0];
        const appendQuitArgument = recordArgsList[1];
        let shouldAppendQuit = false;

        if (stringUtils.isNonBlankString(appendQuitArgument)) {
            if (appendQuitArgument !== '--append-quit') {
                Messenger.getInstance().warn(`Unable to validate arguments: "${appendQuitArgument}". ${recordCommandFormat}`);
                return {};
            }
            shouldAppendQuit = true;
        }
        return { filePath, shouldAppendQuit };
    }

    /**
     * Start skill simulation by calling SMAPI POST skill simulation endpoint.
     * @param {String} utterance text utterance to simulate against.
     * @param {Function} onSuccess callback to execute upon a successful request.
     * @param {Function} onError callback to execute upon a failed request.
     */
    startSkillSimulation(utterance: string, newSession: any, callback: Function) {
        super.startSkillSimulation(
            utterance,
            newSession,
            (err?: Error, response?: any) => {
                if (response) {
                    this.utteranceCache.push(utterance);
                }
                return callback(err, response);
            }
        );
    }

    /**
     * Poll for skill simulation results.
     * @param {String} simulationId simulation ID associated to the current simulation.
     * @param {Function} onSuccess callback to execute upon a successful request.
     * @param {Function} onError callback to execute upon a failed request.
     */
    getSkillSimulationResult(simulationId: string, callback: Function) {
        super.getSkillSimulationResult(simulationId, (err?: Error, response?: any) => {
            if (err) {
                return callback(err);
            }
            const errorMsg = responseParser.getErrorMessage(response.body);
            if (errorMsg) {
                return callback(errorMsg);
            }
            this.newSession = false;
            return callback(null, response);
        });
    }

    /**
     * Clears dialog session by resetting to a new session and clearing caches.
     */
    clearSession() {
        this.newSession = true;
        this.utteranceCache = [];
    }

    /**
     * Function to create replay file.
     * @param {String} filename name of file to save replay JSON.
     */
    createReplayFile(filename: string, utterances: any) {
        if (stringUtils.isNonBlankString(filename)) {
            const content = {
                skillId: this._skillId,
                locale: this._locale,
                type: 'text',
                userInput: utterances
            };
            fs.outputJSONSync(filename, content);
        }
    }
};
