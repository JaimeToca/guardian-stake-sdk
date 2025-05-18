class StakingService implements StakingServiceContract {
    getValidators(): Promise<Validator[]> {
        throw new Error("Method not implemented.");
    }
    getDelegations(): Promise<Validator[]> {
        throw new Error("Method not implemented.");
    }
}