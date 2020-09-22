import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as os from 'os'
import * as xcode from './xcode'

const inputSwiftVersion: string = core.getInput('swift-version');
const inputSwiftPackageDirectory: string =  core.getInput('swift-package-directory') || '.'

const homeDirectory = os.homedir();
const workingDirectory = `${homeDirectory}/action-setup-swift-workspace`;
const swiftenvDirectory = `${workingDirectory}/.swiftenv`;
const swiftenvBinDirectory = `${swiftenvDirectory}/bin`;
const swiftenvPath = `${swiftenvBinDirectory}/swiftenv`;

async function run(name: string, closure: () => Promise<void> ): Promise<void> {
  core.startGroup(name);
  await closure();
  core.endGroup();
}

async function prepare_directory(): Promise<void> {
  await run('Prepare working directory...', async () => {
    await exec.exec('mkdir', ['-p', workingDirectory]);
  })
}

async function download_swiftenv(): Promise<void> {
  await run('Download swiftenv...', async () => {
    await exec.exec('git', ['clone', '--depth', '1', 'https://github.com/kylef/swiftenv.git', swiftenvDirectory]);
    core.addPath(swiftenvBinDirectory);
    core.exportVariable('SWIFTENV_ROOT', swiftenvDirectory)
  })
}

let _swift_version: string = ''
async function swift_version(): Promise<string> {
  if (!_swift_version) {
    if (inputSwiftVersion) {
      _swift_version = inputSwiftVersion
    } else {
      await run(`Check ".swift-version" file in "${inputSwiftPackageDirectory}".`, async () => {
        let status = await exec.exec('swiftenv', ['local'], {
          cwd: inputSwiftPackageDirectory,
          ignoreReturnCode: true,
          listeners: {
            stdout: (data: Buffer) => { _swift_version = data.toString().trim() }
          }
        })
        if (status != 0) {
          throw Error("Swift Version is not specified.")
        }
      })
    }
  }
  return _swift_version
}

async function check_swift(swift_version: string): Promise<boolean> {
  let installed = false;
  await run('Check whether or not Swift ' + swift_version + ' is already installed.', async () => {
    let status = await exec.exec('swiftenv', ['prefix', swift_version], {
                                  ignoreReturnCode: true
                                 });
    installed = (status == 0) ? true : false;
  })
  return installed;
}

async function download_swift(swift_version: string): Promise<void> {
  await run('Download Swift (via swiftenv)...', async () => {
    await exec.exec(swiftenvPath, ['install', swift_version]);
  })
}

async function switch_swift(swift_version: string): Promise<void> {
  await run('Switch Swift to ' + swift_version, async () => {
    let swiftPath = '';
    await exec.exec('swiftenv', ['global', swift_version]);
    await exec.exec('swiftenv', ['versions']);
    await exec.exec(swiftenvPath, ['which', 'swift'], {
      listeners: {
        stdout: (data: Buffer) => { swiftPath = data.toString().trim(); }
      }
    });
    let swiftBinDirectory= swiftPath.replace(/\/swift$/, '');
    
    // FIXME: There should be more appropriate way...
    if (os.platform() == 'darwin') {
      // Use release rather than beta
      const betaRegexResult = (new RegExp('^(/Applications/Xcode[^/]*)_beta.app')).exec(swiftBinDirectory)
      if (betaRegexResult) {
        core.info("Xcode is beta version.")
        const expectedReleasePath = betaRegexResult[1] + '.app'
        const xcodes = await xcode.installedXcodeApplications()
        for (let xcodeInfo of xcodes) {
          if (xcodeInfo.path == expectedReleasePath && swift_version == await xcode.swiftVersionForXcode(xcodeInfo)) {
            core.info(`Xcode release version is found.`)
            swiftBinDirectory = swiftBinDirectory.replace('_beta', '')
            break
          }
        }
      }

      const xcodePathRegExp = new RegExp('^/Applications/Xcode[^/]*.app/Contents/Developer');
      const xcodeMatched = swiftBinDirectory.match(xcodePathRegExp);
      let developerDirectory = '/Applications/Xcode.app/Contents/Developer'
      if (xcodeMatched && xcodeMatched[0]) {
        developerDirectory = xcodeMatched[0]
      } else {
        const latestXcodeInfo = await xcode.latestXcode();
        developerDirectory = `${latestXcodeInfo.path}/Contents/Developer`
      }
      await run(`Switch Developer Directory to ${developerDirectory}`, async () => {
        await exec.exec('sudo xcode-select', ['-switch', developerDirectory]);
      })
    }
    
    core.addPath(swiftBinDirectory);
  })
}

async function main(): Promise<void> {
  await prepare_directory();
  await download_swiftenv();
  let detected_swift_version = await swift_version()
  let installed = await check_swift(detected_swift_version);
  if (installed) {
    core.info(detected_swift_version + ' is already installed.');
  } else {
    await download_swift(detected_swift_version);
  }
  await switch_swift(detected_swift_version);
}

main().catch(error => { core.setFailed(error.message); })
