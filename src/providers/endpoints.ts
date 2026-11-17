import endpoints from './endpoints.json';

export const ORIGINS = endpoints.origins;
export const ENDPOINTS = endpoints.endpoints;
export const CREDENTIAL_ENV = endpoints.credentials;

export type ProviderOrigin = keyof typeof ORIGINS;
export type EndpointId = keyof typeof ENDPOINTS;
