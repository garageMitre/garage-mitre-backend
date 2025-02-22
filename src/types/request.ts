export interface RequestWithRawBody extends Request {
  rawBody: string;
}

export interface AuthenticatedRequest extends Request {
  user: {
    userId?: string;
    email?: string;
    username?: string;
  };
}
