


import type { AppRouter } from '../../../api/registry';


export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';


export type PathsForMethod<Routes, M extends HttpMethod> = {
    [K in keyof Routes]: K extends `${M} ${infer P}` ? P : never;
}[keyof Routes];

export type EndpointAt<
    Routes,
    M extends HttpMethod,
    P extends string,
> = `${M} ${P}` extends keyof Routes ? Routes[`${M} ${P}`] : never;


export type InputOf<Ep> = Ep extends { input: infer I } ? I : never;

export type OutputOf<Ep> = Ep extends { output: infer O } ? O : unknown;

export type RequestOptions = {
    headers?: Record<string, string>;
    signal?: AbortSignal;
};

export type InputArgs<I> = [I] extends [void]
    ? [input?: undefined, options?: RequestOptions]
    : undefined extends I
    ? [input?: I, options?: RequestOptions]
    : [input: I, options?: RequestOptions];


export type ApiResult<O> =
    | { data: O; error?: undefined; response: Response }
    | { data?: undefined; error: unknown; response: Response };


export type ClientMethod<Routes, M extends HttpMethod> = <
    P extends PathsForMethod<Routes, M> & string,
>(
    path: P,
    ...args: InputArgs<InputOf<EndpointAt<Routes, M, P>>>
) => Promise<ApiResult<OutputOf<EndpointAt<Routes, M, P>>>>;



export type ApiClient<Routes = AppRouter> = {
    GET: ClientMethod<Routes, 'get'>;
    POST: ClientMethod<Routes, 'post'>;
    PUT: ClientMethod<Routes, 'put'>;
    PATCH: ClientMethod<Routes, 'patch'>;
    DELETE: ClientMethod<Routes, 'delete'>;
};

export type ClientOptions = {
    baseUrl?: string;
    headers?: Record<string, string>;
    fetch?: typeof fetch;
};