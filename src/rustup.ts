// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

'use strict';

import * as child_process from 'child_process';
import { window } from 'vscode';
import { startSpinner, stopSpinner } from './spinner';

// This module handles running the RLS via rustup, including checking that rustup
// is installed and installing any required components/toolchains.

export function runRlsViaRustup(): Promise<child_process.ChildProcess> {
    return checkForNightly().then(checkForRls).then(() => child_process.spawn("rustup", ["run", "nightly", "rls"]));
}

// Check for the nightly toolchain (and that rustup exists)
function checkForNightly(): Promise<{}> {
    return new Promise((resolve, reject) => {
        child_process.exec("rustup toolchain list", (error, stdout, _stderr) => {
            if (error) {
                console.log(error);
                // rustup not present
                window.showErrorMessage('Rustup not available. Install from https://www.rustup.rs/');
                reject();
                return;
            }
            if (stdout.indexOf("nightly") == -1) {
                // No nightly channel
                window.showInformationMessage("Nightly toolchain not installed. Install?", "Yes").then((clicked) => {
                    if (clicked == "Yes") {
                        startSpinner("Installing nightly toolchain...");
                        child_process.exec("rustup toolchain install nightly", (error, stdout, stderr) => {
                            console.log(stdout);
                            console.log(stderr);
                            if (error) {
                                window.showErrorMessage('Could not install nightly toolchain');
                                stopSpinner('Could not install nightly toolchain');
                                reject();
                            } else {
                                stopSpinner('Nightly toolchain installed successfully');
                                resolve();
                            }
                        });
                    } else {
                        reject();
                    }
                });
            } else {
                resolve();
            }
        });
    });
}

// Check for rls components.
function checkForRls(): Promise<void> {
    return new Promise((resolve, reject) => {
        child_process.exec("rustup component list --toolchain nightly", (error, stdout, _stderr) => {
            if (error) {
                console.log(error);
                // rustup error?
                window.showErrorMessage('Unexpected error initialising RLS - error running rustup');
                reject();
                return;
            }
            if (stdout.search(/^rls.* \((default|installed)\)$/m) == -1 ||
                stdout.search(/^rust-analysis.* \((default|installed)\)$/m) == -1 ||
                stdout.search(/^rust-src.* \((default|installed)\)$/m) == -1) {
                // missing component
                window.showInformationMessage("RLS not installed. Install?", "Yes").then((clicked) => {
                    if (clicked == "Yes") {
                        installRls(resolve, reject);
                    } else {
                        reject();
                    }
                });
            } else {
                resolve();
            }
        });
    });
}

function installRls(resolve: () => void, reject: (reason?: any) => void): void {
    startSpinner('Installing RLS components');
    child_process.exec("rustup component add rust-analysis --toolchain nightly", (error, stdout, stderr) => {
        console.log(stdout);
        console.log(stderr);
        if (error) {
            window.showErrorMessage('Could not install RLS component (rust-analysis)');
            stopSpinner('Could not install RLS');
            reject("installing rust-analysis failed");
            return;
        } else {
            child_process.exec("rustup component add rust-src --toolchain nightly", (error, stdout, stderr) => {
                console.log(stdout);
                console.log(stderr);
                if (error) {
                    window.showErrorMessage('Could not install RLS component (rust-src)');
                    stopSpinner('Could not install RLS');
                    reject("installing rust-src failed");
                    return;
                } else {
                    console.log("install rls");
                    child_process.exec("rustup component add rls --toolchain nightly", (error, stdout, stderr) => {
                        console.log(stdout);
                        console.log(stderr);
                        if (error) {
                            window.showErrorMessage('Could not install RLS component (rls)');
                            stopSpinner('Could not install RLS');
                            reject("installing rls failed");
                        } else {
                            stopSpinner('RLS components installed successfully');
                            resolve();
                        }
                    });
                }
            });
        }
    });
}
