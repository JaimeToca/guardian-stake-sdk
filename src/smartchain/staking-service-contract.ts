interface StakingServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(): Promise<Validator[]>;
}
