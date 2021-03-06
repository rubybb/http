/*
    Copyright (C) 2021 rubybb <https://github.com/rubybb>

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

/// <reference lib="dom" />
import FormData from "form-data";

import { compile } from "path-to-regexp";
import deepmerge from "deepmerge";
import fetch, { Request, Response } from "cross-fetch";
import qstr from "query-string";

export type PartialHTTPOptions = Partial<HTTPOptions>;
export type ResultType = "response" | keyof Response;

export declare interface HTTPOptions extends Omit<RequestInit, "body"> {
    resultType: ResultType;
    query: Record<string, any>;
    excludeDefaults: boolean;
    baseURL: string;

    /** logs loads of information to console. */
    debug: boolean;

    /** prevents requests from throwing on response errors. */
    nothrow: boolean;

    /** for path params */
    [key: string]: unknown
}


class HTTPError extends Error {
    public name = "HTTPError";

    public method: string;
    public status = -1;

    constructor(public url: string, options: PartialHTTPOptions, response?: Response, public body?: unknown, message?: string) {
        super(message ? message : `Request failed (${options.method.toUpperCase()} ${url})`);

        this.method = options.method.toUpperCase();
        if (response) this.status = response.status;
    }

    public toJSON() {
        return {
            message: this.message,
            status: this.status,
            method: this.method,
            url: this.url,
            body: (typeof this.body !== "undefined" ?
                this.body : null
            ),
        };
    }
}

export class HTTP {
    constructor(public options: PartialHTTPOptions = {}, private immutable = false) { }

    static create(options: PartialHTTPOptions, immutable?: boolean): HTTP {
        return new HTTP(options, immutable);
    }

    public mutate(this: HTTP, options: PartialHTTPOptions): HTTP {
        if (this.immutable) throw new ReferenceError("Cannot modify; HTTP instance declared as immutable");

        this.options = deepmerge(this.options, options);
        return this;
    }

    public clone(this: HTTP, options: PartialHTTPOptions, immutable?: boolean): HTTP {
        return new HTTP(deepmerge(this.options, options), immutable);
    }

    private async request<T = unknown>(this: HTTP, path: string, options: PartialHTTPOptions = {}, body: unknown): Promise<null | T> {
        const _options = options; /* the options passed to the request function, without being merged into defaults */
        options = this.options.excludeDefaults ? _options : deepmerge(this.options, _options);

        /* handle url creation */
        const initialURL = new URL(path, this.options.baseURL);
        let url = (initialURL.pathname.includes(":")) ?
            initialURL.href.replace(initialURL.pathname, compile(initialURL.pathname)(options)) :
            initialURL.href;

        /* handle generation of query string */
        if (options.query) url += ("?" + qstr.stringify(options.query));

        options.debug && console.debug(options.method, url, { path, options });
        const response: Response = await fetch(url, { ...options, body: (body as BodyInit) });

        if (!options.resultType || !response[options.resultType])
            /* nothrow doesn't matter here because this is not a response error 
               the function is being passed invalid paramaters, this should never fail silently. */
            throw new TypeError(`Unknown resultType (${options.resultType})`);

        let result = options.resultType === "response" ? response : await response[options.resultType];
        try { result = typeof result === "function" ? (await result.call(response)) : result; } catch (error) {
            if (!options.nothrow) throw new HTTPError(url, options, response, null, `Response failed (${error.message})`);
            result = null;
        }

        if (!response.ok && !options.nothrow) throw new HTTPError(url, options, response, result);
        return result as unknown as T;
    }

    async get<ResultType>(this: HTTP, path: string, options: Partial<HTTPOptions> = {}): Promise<ResultType> {
        return this.request<ResultType>(path, { ...options, method: "GET" }, null);
    }

    async head<ResultType>(this: HTTP, path: string, options: Partial<HTTPOptions> = {}): Promise<ResultType> {
        return this.request<ResultType>(path, { ...options, method: "HEAD" }, null);
    }

    /* body'd request methods */

    async post<ResultType>(this: HTTP, path: string, body: unknown, options: Partial<HTTPOptions> = {}): Promise<ResultType> {
        return this.request<ResultType>(path, { ...options, method: "POST" }, body);
    }

    async patch<ResultType>(this: HTTP, path: string, body: unknown, options: Partial<HTTPOptions> = {}): Promise<ResultType> {
        return this.request<ResultType>(path, { ...options, method: "PATCH" }, body);
    }

    async put<ResultType>(this: HTTP, path: string, body: unknown, options: Partial<HTTPOptions> = {}): Promise<ResultType> {
        return this.request<ResultType>(path, { ...options, method: "PUT" }, body);
    }

    /* optional body'd request methods */

    async delete<ResultType>(this: HTTP, path: string, body?: unknown, options: Partial<HTTPOptions> = {}): Promise<ResultType> {
        return this.request<ResultType>(path, { ...options, method: "DELETE" }, body);
    }
}

export const http = new HTTP({}, true);
export default http;