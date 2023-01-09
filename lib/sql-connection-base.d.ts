import { ConnectionBase, Field, ModelClass, QueryEngine, QueryResults, Model } from 'mythix-orm';
import { GenericObject } from 'mythix-orm/lib/interfaces/common';

export declare interface ModelDataFromQueryResults {
  [key: string]: Array<GenericObject>;
}

declare class SQLConnectionBase extends ConnectionBase {
  public isLimitSupportedInContext(options?: GenericObject): boolean;
  public isOrderSupportedInContext(options?: GenericObject): boolean | string;

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

  public buildModelsFromModelDataMap(
    queryEngine: QueryEngine,
    modelDataMap: ModelDataFromQueryResults,
    callback: (Model: ModelClass, model: Model) => Model,
  ): Array<Model>;

  public updateModelsFromResults(
    Model: ModelClass,
    storedModels: Array<Model>,
    results: QueryResults
  ): Array<Model>;

  public getUpdateOrDeleteChangeCount(queryResult: any): number;
}

export default SQLConnectionBase;
