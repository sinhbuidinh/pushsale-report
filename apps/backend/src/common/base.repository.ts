import {
  DeepPartial,
  ObjectLiteral,
  QueryDeepPartialEntity,
  Repository,
  UpdateResult,
} from 'typeorm';

export abstract class BaseRepository<Entity extends ObjectLiteral> extends Repository<Entity> {
  async createRow(partial: DeepPartial<Entity>): Promise<Entity> {
    const entity = this.create(partial);
    return this.save(entity);
  }

  async updateById(
    id: string | number,
    partialEntity: QueryDeepPartialEntity<Entity>,
  ): Promise<UpdateResult> {
    return this.createQueryBuilder()
      .update(this.metadata.target)
      .set(partialEntity)
      .where('id = :id', { id })
      .execute();
  }
}
