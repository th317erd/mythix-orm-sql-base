import { Field, FieldOrderInfo, JoinTableInfo, Model, ModelClass, PreparedModels, QueryEngine, QueryGeneratorBase } from 'mythix-orm';
import { LiteralBase } from 'mythix-orm/lib/connection/literals';
import { GenericObject } from 'mythix-orm/lib/interfaces/common';
import { Type } from 'mythix-orm/lib/types';

export declare interface QueryConditionContext {
  queryPart: GenericObject;
  field: Field;
  sqlOperator: string;
  operator: string | LiteralBase;
  value: any;
}

declare class SQLQueryGeneratorBase extends QueryGeneratorBase {
  public prepareArrayValuesForSQL(array: Array<any>): Array<any>;
  public parseFieldProjection(value: string, getRawField: boolean): string | Field | undefined;
  public parseFieldProjectionToFieldMap(selectStatement: string): Map<string, Field | string>;

  public generateSelectQueryFieldProjection(
    queryEngine: QueryEngine,
    options?: GenericObject,
    asMap?: false | undefined,
  ): Array<string>;

  public generateSelectQueryFieldProjection(
    queryEngine: QueryEngine,
    options?: GenericObject,
    asMap?: true,
  ): Map<string, string>;

  public generateSelectQueryOperatorFromQueryEngineOperator(
    queryPart: GenericObject,
    operator: string | LiteralBase,
    value: any,
    valueIsReference: boolean,
    options?: GenericObject,
  ): string;

  public formatLikeValue(context: QueryConditionContext): any;
  public generateConditionPostfix(context: QueryConditionContext): string;

  public generateSelectQueryCondition(
    queryPart: GenericObject,
    value: any,
    options?: GenericObject,
  ): string;

  public generateFromTableOrTableJoin(
    Model: ModelClass,
    joinType: string | LiteralBase,
    options?: GenericObject
  ): string;

  public generateSelectJoinOnTableQueryCondition(
    leftQueryPart: GenericObject,
    rightQueryPart: GenericObject,
    leftField: Field,
    rightField: Field,
    operator: string | LiteralBase,
    options?: GenericObject,
  ): string;

  public generateJoinOnTableQueryConditions(
    joinInfos: Array<JoinTableInfo>,
    options?: GenericObject
  ): string;

  public generateSQLJoinTypeFromQueryEngineJoinType(joinType: LiteralBase, outer: boolean, options?: GenericObject): LiteralBase;
  public generateSQLJoinTypeFromQueryEngineJoinType(joinType: string, outer: boolean, options?: GenericObject): string;
  public sortJoinRelationOrder(joins: Map<string, Array<JoinTableInfo>>): Array<string>;
  public generateSelectQueryJoinTables(queryEngine: QueryEngine, options?: GenericObject): string;
  public generateSelectWhereConditions(queryEngine: QueryEngine, options?: GenericObject): string;
  public generateOrderClause(
    orders: LiteralBase | FieldOrderInfo | Array<LiteralBase | FieldOrderInfo>,
    options?: GenericObject
  ): string;

  public generateLimitClause(limit: LiteralBase | number | string, options?: GenericObject): string;
  public generateOffsetClause(offset: LiteralBase | number | string, options?: GenericObject): string;
  public generateSelectOrderLimitOffset(queryEngine: QueryEngine, options?: GenericObject): string;
  public generateWhereAndOrderLimitOffset(queryEngine: QueryEngine, options?: GenericObject): string;

  public generateSelectStatement(
    queryEngine: QueryEngine,
    options?: GenericObject
  ): string | { sql: string, projectionFields: Map<string, string> };

  public getFieldDefaultValue(
    field: Field,
    fieldName: string,
    options?: GenericObject,
  ): string | LiteralBase | undefined;

  public generateIndexName(
    Model: ModelClass,
    field: Field,
    index: string | true,
    options?: GenericObject
  ): string;

  public generateColumnIndexes(
    Model: ModelClass,
    field: Field,
    indexes: string | boolean | Array<string | boolean | Array<string>>,
    options?: GenericObject,
  ): Array<string>;

  public generateDropTableStatement(Model: ModelClass, options?: GenericObject): string;
  public generateForeignKeyConstraint(field: Field, type: Type, options?: GenericObject): string;
  public generateCreateTableStatementInnerTail(Model: ModelClass, options?: GenericObject): Array<string>;
  public generateCreateTableStatementOuterTail(Model: ModelClass, options?: GenericObject): Array<string>;
  public generateCreateTableStatement(Model: ModelClass, options?: GenericObject): string;

  public generateInsertFieldValuesFromModel(
    model: Model,
    options?: GenericObject
  ): { modelChanges: GenericObject, rowValues: string } | undefined;

  public generateInsertValuesFromModels(
    Model: ModelClass,
    models: Model | Array<Model> | PreparedModels,
    options?: GenericObject,
  ): { modelChanges: Array<GenericObject>, values: string } | undefined;

  public generateInsertStatementTail(
    Model: ModelClass,
    model: Model,
    options: GenericObject,
    context: {
      escapedTableName: string,
      modelChanges: Array<GenericObject>,
      dirtyFields: Array<Field>,
    },
  ): string | undefined;

  public generateInsertStatement(
    Model: ModelClass,
    models: Model | Array<Model> | PreparedModels,
    options?: GenericObject,
  ): string;

  public generateUpdateStatementTail(
    Model: ModelClass,
    model: Model | GenericObject,
    queryEngine: QueryEngine,
    options: GenericObject,
    context: {
      queryEngine: QueryEngine,
      escapedTableName: string,
      modelChanges: Array<GenericObject>,
      dirtyFields: Array<Field>,
      where: string,
    },
  ): string | undefined;

  public generateUpdateStatement(
    Model: ModelClass,
    model: Model | GenericObject,
    queryEngine: QueryEngine,
    options?: GenericObject,
  ): string;

  public generateDeleteStatement(Model: ModelClass, queryEngine: QueryEngine, options?: GenericObject): string;
  public generateTruncateTableStatement(Model: ModelClass, options?: GenericObject): string;

  public _collectRemoteReturningFields(Model: ModelClass): Array<string>;
  public _collectReturningFields(
    Model: ModelClass,
    model: Model,
    options: GenericObject,
    context: {
      escapedTableName: string,
      modelChanges: Array<GenericObject>,
      dirtyFields: Array<Field>,
    },
  ): string | undefined;

  toConnectionString(queryEngine: QueryEngine, options?: GenericObject): string;
}

export default SQLQueryGeneratorBase;
