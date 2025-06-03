export interface ApiErrorDetails {
  status?: number;
  statusText?: string;
  data?: any;
  type: ApiErrorType;
}

export enum ApiErrorType {
    ServerResponseError,
    NetworkError,
    RequestSetupError,
    UnexpectedError,
    UnknownError,
}