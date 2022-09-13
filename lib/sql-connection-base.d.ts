import { ConnectionBase, Field, ModelClass, QueryEngine, QueryResults, Model } from 'mythix-orm';
import { GenericObject } from 'mythix-orm/lib/interfaces/common';

export declare interface ModelDataFromQueryResults {
  [ key: string ]: Array<GenericObject>;
}

declare class SQLConnectionBase extends ConnectionBase {
  public prepareArrayValuesForSQL(array: Array<any>): Array<any>;
  public generateSavePointName(): string;

  public findAllFieldsFromFieldProjectionMap(
    projectionFieldMap: Map<string, string> | Array<string>
  ): Array<Field>;

  public buildModelDataMapFromSelectResults(
    queryEngine: QueryEngine,
    result: QueryResults
  ): ModelDataFromQueryResults;

  public enableForeignKeyConstraints(enable: boolean): Promise<void>;

  buildModelsFromModelDataMap(
    queryEngine: QueryEngine,
    modelDataMap: ModelDataFromQueryResults,
    callback: (Model: ModelClass, model: Model) => Model,
  ): Array<Model>;

  updateModelsFromResults(
    Model: ModelClass,
    storedModels: Array<Model>,
    results: QueryResults
  ): Array<Model>;
}

export default SQLConnectionBase;
