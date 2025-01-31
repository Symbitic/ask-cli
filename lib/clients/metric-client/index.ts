import { v4 as uuid } from 'uuid';
import axios, { AxiosInstance } from 'axios';
import AppConfig, { getAppConfig } from '@src/model/app-config';
import profileHelper from '@src/utils/profile-helper';
import { METRICS } from '@src/utils/constants';
import pck from '../../../package.json';

const MetricActionResult = {
    SUCCESS: 'Success',
    FAILURE: 'Failure'
};

class MetricAction {
    endTime: any;
    failureMessage: string;
    name: string;
    result: any;
    startTime: Date;
    type: string;
    id: string;
    _ended: boolean;

    /**
     * @constructor
     * @param {string} name - The action name.
     * @param {string} type - The action type.
     */
    constructor(name: string, type: string) {
        this.endTime = null;
        this.failureMessage = '';
        this.name = name;
        this.result = null;
        this.startTime = new Date();
        this.type = type;
        this.id = uuid();
        this._ended = false;
    }

    /**
     * Closes action
     * @param {Error|string} [error=null] error - Error object or string indicating error.
     */
    end(error: Error | null = null) {
        if (this._ended) return;

        // if Error object extract error message,
        // otherwise error message string or null was passed as a parameter
        const errorMessage = error && error instanceof Error ? error.message : error;

        this.result = errorMessage ? MetricActionResult.FAILURE : MetricActionResult.SUCCESS;
        this.failureMessage = errorMessage || '';
        this.endTime = new Date();
        this._ended = true;
    }

    /**
     * Implementation of custom toJSON method to modify serialization with JSON.stringify
     */
    toJSON() {
        return {
            end_time: this.endTime,
            failure_message: this.failureMessage,
            name: this.name,
            result: this.result,
            start_time: this.startTime,
            type: this.type,
            id: this.id
        };
    }
}

class MetricClient {
    httpClient: AxiosInstance;
    serverUrl: string;
    postRetries: number;
    enabled: boolean;
    data: any;

    /**
     * @constructor
     */
    constructor() {
        this.httpClient = axios.create({
            timeout: 3000,
            headers: { 'Content-Type': 'text/plain' }
        });
        this.serverUrl = METRICS.ENDPOINT;
        this.postRetries = 3;

        this.enabled = this._isEnabled();
        this.data = {
            version: pck.version,
            machineId: this._getMachineId(),
            timeStarted: new Date(),
            newUser: false, // default to false since unused.
            timeUploaded: null,
            clientId: pck.name,
            actions: []
        };
    }

    /**
     * Starts action
     * @param {string} name - The action name
     * @param {string} type - The action type
     * @return {MetricAction}
     */
    startAction(name: string, type: string) {
        const action = new MetricAction(name, type);
        this.data.actions.push(action);
        return action;
    }

    /**
     * Returns current data store in the metric client
     * @return {{version: string, machineId: string, timeStarted: Date,
     * newUser: boolean, timeUploaded: Date|null, clientId: string, actions: MetricAction[]}}
     */
    getData() {
        return this.data;
    }

    /**
     * Sends data to the metric server
     * @param {Error|string} [error=null] error - Error object or string indicating error.
     * @returns {Promise<{success: boolean}>}
     */
    sendData(error: Error | string | null = null) {
        if (!this.enabled) {
            this.data.actions = [];
            return new Promise(resolve => resolve({ success: true }));
        }
        this.data.actions.forEach((action: any) => action.end(error));
        return this._upload()
            .then(() => {
                this.data.actions = [];
                return { success: true };
            })
            .catch(() => ({ success: false }));
    }

    /**
     * Implementation of custom toJSON method to modify serialization with JSON.stringify
     */
    toJSON() {
        return {
            version: this.data.version,
            machine_id: this.data.machineId,
            time_started: this.data.timeStarted,
            new_user: this.data.newUser,
            time_uploaded: this.data.timeUploaded,
            client_id: this.data.clientId,
            actions: this.data.actions
        };
    }

    _upload() {
        this.data.timeUploaded = new Date();
        const payload = JSON.stringify({ payload: this });
        const postPromise = () => this.httpClient.post(this.serverUrl, payload);
        return this._retry(this.postRetries, postPromise);
    }

    _retry(retries: number, fn: Function) {
        return fn().catch((err: Error) => (retries > 1 ? this._retry(retries - 1, fn) : Promise.reject(err)));
    }

    _isEnabled() {
        if (profileHelper.isEnvProfile()) return true;
        if (process.env.ASK_SHARE_USAGE === 'false') return false;
        if (!AppConfig.configFileExists()) return false;

        new AppConfig();
        return getAppConfig().getShareUsage();
    }

    _getMachineId() {
        if (!this.enabled) return;
        if (profileHelper.isEnvProfile()) return 'all_environmental';
        const appConfig = getAppConfig();
        if (!appConfig.getMachineId()) {
            appConfig.setMachineId(uuid());
            appConfig.write();
        }

        return appConfig.getMachineId();
    }
}

export default {
    MetricClient,
    MetricActionResult
};
