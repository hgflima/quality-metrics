export class UserRepository {
  findById(id: string): { id: string } {
    return { id };
  }
}
