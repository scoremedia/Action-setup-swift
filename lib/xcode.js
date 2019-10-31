"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const exec = __importStar(require("@actions/exec"));
const os = __importStar(require("os"));
const semver = __importStar(require("semver"));
async function _semanticVersionOfXcodeForPath(path) {
    let versionString = '';
    await exec.exec('defaults', ['read', `${path}/Contents/Info`, 'CFBundleShortVersionString'], {
        listeners: {
            stdout: (data) => { versionString = data.toString().trim(); }
        }
    });
    if ((/^\d+\.\d+$/).test(versionString)) {
        versionString += '.0';
    }
    let ver = semver.parse(versionString);
    if (ver == null) {
        throw "Invalid Version String.";
    }
    return ver;
}
let _xcode_info_list = [];
async function installedXcodeApplications() {
    if (os.platform() == 'darwin' && _xcode_info_list.length < 1) {
        let paths = [];
        await exec.exec('mdfind', ['kMDItemCFBundleIdentifier == "com.apple.dt.Xcode"'], {
            ignoreReturnCode: true,
            listeners: {
                stdout: (data) => {
                    paths = data.toString().split(/\r\n|\r|\n/).map(path => path.trim()).filter(path => path != '');
                }
            }
        });
        for (let ii = 0; ii < paths.length; ii++) {
            const version = await _semanticVersionOfXcodeForPath(paths[ii]);
            const info = { path: paths[ii], version: version };
            // core.info(`The version of Xcode at "${info.path}" is ${info.version}.`);
            _xcode_info_list.push(info);
        }
    }
    return _xcode_info_list;
}
exports.installedXcodeApplications = installedXcodeApplications;
async function latestXcode() {
    const list = await installedXcodeApplications();
    let latest = null;
    list.forEach((info) => {
        if (!latest || semver.gt(info.version, latest.version)) {
            latest = info;
        }
    });
    if (latest == null) {
        throw "Cant't detect latest Xcode.";
    }
    return latest;
}
exports.latestXcode = latestXcode;