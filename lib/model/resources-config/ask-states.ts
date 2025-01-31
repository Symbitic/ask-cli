import fs from 'fs-extra';
import path from 'path';

import * as CONSTANTS from '@src/utils/constants';

import ConfigFile from '../abstract-config-file';

// instance which stores the singleton
let instance: AskStates | null = null;

export const BASE: any = {
    askcliStatesVersion: '2020-03-31',
    profiles: {}
};

export default class AskStates extends ConfigFile {
    /**
     * Constructor for AskStates class
     * @param {string} filePath
     * @throws {Error}
     */
    constructor(filePath: string) {
        if (instance && instance._path === filePath) {
            return instance;
        }
        // init by calling super() if instance not exists
        super(filePath);
        this.read();
        instance = this;
    }

    static withContent(filePath: string, content = BASE) {
        super.withContent(filePath, content);
        new AskStates(filePath);
    }

    static getInstance() {
        return instance;
    }

    static dispose() {
        instance = null;
    }

    // getter and setter

    getSkillId(profile: string) {
        return this.getProperty(['profiles', profile, 'skillId']);
    }

    setSkillId(profile: string, skillId: string) {
        this.setProperty(['profiles', profile, 'skillId'], skillId);
    }

    // Group for the "skillMetadata"
    getSkillMetaLastDeployHash(profile: string) {
        return this.getProperty(['profiles', profile, 'skillMetadata', 'lastDeployHash']);
    }

    setSkillMetaLastDeployHash(profile: string, lastDeployHash: any) {
        this.setProperty(['profiles', profile, 'skillMetadata', 'lastDeployHash'], lastDeployHash);
    }

    // Group for the "code"
    getCodeLastDeployHashByRegion(profile: string, region: string) {
        return this.getProperty(['profiles', profile, 'code', region, 'lastDeployHash']);
    }

    setCodeLastDeployHashByRegion(profile: string, region: string, hash: string) {
        this.setProperty(['profiles', profile, 'code', region, 'lastDeployHash'], hash);
    }

    getCodeBuildByRegion(projRoot: string, codeSrc: string) {
        if (!codeSrc) {
            return null;
        }
        /**
         * Resolve the base path for build folder:
         *   if src is a folder, direct add build folder inside of it;
         *   if src is a file, use the path to the folder it's located as base folder.
         */
        const base = path.resolve(
            fs.statSync(codeSrc).isDirectory() ? codeSrc : codeSrc.replace(path.basename(codeSrc), '')
        );
        const mirrorPath = path.relative(projRoot, base);
        return {
            folder: path.join(projRoot, CONSTANTS.FILE_PATH.HIDDEN_ASK_FOLDER, mirrorPath),
            file: path.join(projRoot, CONSTANTS.FILE_PATH.HIDDEN_ASK_FOLDER, mirrorPath, 'build.zip')
        };
    }

    // Group for the "skillInfrastructure"
    getSkillInfraDeployState(profile: string, infraType: string) {
        return this.getProperty(['profiles', profile, 'skillInfrastructure', infraType, 'deployState']);
    }

    setSkillInfraDeployState(profile: string, infraType: string, deployState: string) {
        this.setProperty(['profiles', profile, 'skillInfrastructure', infraType, 'deployState'], deployState);
    }
};
