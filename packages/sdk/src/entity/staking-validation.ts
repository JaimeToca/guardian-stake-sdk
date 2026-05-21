import { ValidationError } from "./errors";
import type { GetValidatorsParams } from "./staking-types";

export function validatePageParams(params: GetValidatorsParams): void {
  if (params.page !== undefined && (!Number.isInteger(params.page) || params.page < 1))
    throw new ValidationError("INVALID_PAGE", "page must be an integer of 1 or greater");
  if (params.pageSize !== undefined && (!Number.isInteger(params.pageSize) || params.pageSize < 1))
    throw new ValidationError("INVALID_PAGE_SIZE", "pageSize must be an integer of 1 or greater");
}
