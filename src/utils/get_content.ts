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

// Using approach from https://www.tomas-dvorak.cz/posts/nodejs-request-without-dependencies/
// to avoid dependency
import { get } from 'https';


export function get_content(url: string):Promise<string> {
    // return new pending promise
    return new Promise((resolve, reject) => {
      // select http or https module, depending on reqested url
      const request = get(url, (response) => {
        // handle http errors
        if (response.statusCode && (response.statusCode < 200 || response.statusCode > 299)) {
           reject(new Error('Failed to load page, status code: ' + response.statusCode));
         }
        // temporary data holder
        const body: Array<string | Buffer> = [];
        // on every content chunk, push it to the data array
        response.on('data', (chunk) => body.push(chunk));
        // we are done, resolve promise with those joined chunks
        response.on('end', () => resolve(body.join('')));
      });
      // handle connection errors of the request
      request.on('error', (err) => reject(err));
      });
  }
  