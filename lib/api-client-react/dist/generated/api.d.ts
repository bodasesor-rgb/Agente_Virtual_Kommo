import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { CreateExampleBody, DeleteResult, Example, ExampleList, ExamplesStats, HealthStatus } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List all training examples
 */
export declare const getListExamplesUrl: () => string;
export declare const listExamples: (options?: RequestInit) => Promise<ExampleList>;
export declare const getListExamplesQueryKey: () => readonly ["/api/examples"];
export declare const getListExamplesQueryOptions: <TData = Awaited<ReturnType<typeof listExamples>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listExamples>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listExamples>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListExamplesQueryResult = NonNullable<Awaited<ReturnType<typeof listExamples>>>;
export type ListExamplesQueryError = ErrorType<unknown>;
/**
 * @summary List all training examples
 */
export declare function useListExamples<TData = Awaited<ReturnType<typeof listExamples>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listExamples>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Add a new training example
 */
export declare const getCreateExampleUrl: () => string;
export declare const createExample: (createExampleBody: CreateExampleBody, options?: RequestInit) => Promise<Example>;
export declare const getCreateExampleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createExample>>, TError, {
        data: BodyType<CreateExampleBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createExample>>, TError, {
    data: BodyType<CreateExampleBody>;
}, TContext>;
export type CreateExampleMutationResult = NonNullable<Awaited<ReturnType<typeof createExample>>>;
export type CreateExampleMutationBody = BodyType<CreateExampleBody>;
export type CreateExampleMutationError = ErrorType<unknown>;
/**
 * @summary Add a new training example
 */
export declare const useCreateExample: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createExample>>, TError, {
        data: BodyType<CreateExampleBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createExample>>, TError, {
    data: BodyType<CreateExampleBody>;
}, TContext>;
/**
 * @summary Training examples summary stats
 */
export declare const getGetExamplesStatsUrl: () => string;
export declare const getExamplesStats: (options?: RequestInit) => Promise<ExamplesStats>;
export declare const getGetExamplesStatsQueryKey: () => readonly ["/api/examples/stats"];
export declare const getGetExamplesStatsQueryOptions: <TData = Awaited<ReturnType<typeof getExamplesStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getExamplesStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getExamplesStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetExamplesStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getExamplesStats>>>;
export type GetExamplesStatsQueryError = ErrorType<unknown>;
/**
 * @summary Training examples summary stats
 */
export declare function useGetExamplesStats<TData = Awaited<ReturnType<typeof getExamplesStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getExamplesStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Delete a training example
 */
export declare const getDeleteExampleUrl: (id: string) => string;
export declare const deleteExample: (id: string, options?: RequestInit) => Promise<DeleteResult>;
export declare const getDeleteExampleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteExample>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteExample>>, TError, {
    id: string;
}, TContext>;
export type DeleteExampleMutationResult = NonNullable<Awaited<ReturnType<typeof deleteExample>>>;
export type DeleteExampleMutationError = ErrorType<unknown>;
/**
 * @summary Delete a training example
 */
export declare const useDeleteExample: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteExample>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteExample>>, TError, {
    id: string;
}, TContext>;
/**
 * @summary Update a training example
 */
export declare const getUpdateExampleUrl: (id: string) => string;
export declare const updateExample: (id: string, createExampleBody: CreateExampleBody, options?: RequestInit) => Promise<Example>;
export declare const getUpdateExampleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateExample>>, TError, {
        id: string;
        data: BodyType<CreateExampleBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateExample>>, TError, {
    id: string;
    data: BodyType<CreateExampleBody>;
}, TContext>;
export type UpdateExampleMutationResult = NonNullable<Awaited<ReturnType<typeof updateExample>>>;
export type UpdateExampleMutationBody = BodyType<CreateExampleBody>;
export type UpdateExampleMutationError = ErrorType<unknown>;
/**
 * @summary Update a training example
 */
export declare const useUpdateExample: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateExample>>, TError, {
        id: string;
        data: BodyType<CreateExampleBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateExample>>, TError, {
    id: string;
    data: BodyType<CreateExampleBody>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map