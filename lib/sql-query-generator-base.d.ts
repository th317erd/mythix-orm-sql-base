import { Field, Model, ModelClass, PreparedModels, QueryEngine, QueryGeneratorBase } from 'mythix-orm';
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

export declare interface GetEscapedFieldNameOptions {
  fieldNameOnly?: boolean;
}

export declare interface GetEscapedTableNameNameOptions {
  tableNamePrefix?: string;
}

export declare interface GetEscapedColumnNameOptions extends GetEscapedTableNameNameOptions {
  columnNamePrefix?: string
  columnNameOnly?: boolean;
}

export declare interface GetEscapedProjectionNameOptions extends GetEscapedColumnNameOptions, GetEscapedFieldNameOptions {
  noProjectionAliases?: boolean;
}

export declare interface GetEscapedModelFieldsOptions extends GetEscapedProjectionNameOptions {
  asProjection?: boolean;
  asColumn?: boolean;
}

export declare interface JoinTableInfo {
  operator: string;
  joinType: string | LiteralBase;
  rootModelName: string;
  joinModel: ModelClass;
  joinModelName: string;
  leftSideModel: ModelClass;
  leftSideModelName: string;
  leftQueryContext: GenericObject;
  leftSideField: Field;
  rightSideModel: ModelClass;
  rightSideModelName: string;
  rightQueryContext: GenericObject;
  rightSideField: Field;
}

declare class SQLQueryGeneratorBase extends QueryGeneratorBase {
  public getEscapedFieldName(Model: ModelClass | null | undefined, field: Field, options?: GetEscapedFieldNameOptions): string;
  public getEscapedColumnName(Model: ModelClass | null | undefined, field: Field, options?: GetEscapedColumnNameOptions): string;
  public getEscapedTableName(modelOrField: ModelClass | Field, options?: GetEscapedTableNameNameOptions): string;
  public getEscapedProjectionName(Model: ModelClass | null | undefined, field: Field, options?: GetEscapedProjectionNameOptions): string;
  public getEscapedModelFields(Model: ModelClass, options?: GetEscapedModelFieldsOptions): { [key: string]: string };
  public isFieldIdentifier(value: string): boolean;
  public getProjectedFields(queryEngine: QueryEngine, options?: GenericObject, asMap?: false | undefined): Array<string>;
  public getProjectedFields(queryEngine: QueryEngine, options?: GenericObject, asMap?: true): Map<string, string>;

  public getJoinTableInfoFromQueryContexts(
    leftQueryContext: GenericObject,
    rightQueryContext: GenericObject,
    joinType: string | LiteralBase,
    options?: GenericObject
  ): JoinTableInfo;

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
  public generateOrderClause(queryEngine: QueryEngine, options?: GenericObject): string;
  public generateGroupByClause(queryEngine: QueryEngine, options?: GenericObject): string;

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
    indexFieldNames: Array<string>,
    options?: GenericObject
  ): string;

  public generateColumnIndexes(
    Model: ModelClass,
    field: Field,
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

  public generateDeleteStatementReturningClause(Model: ModelClass, queryEngine: QueryEngine, pkField: Field | null, escapedColumnName: string | null, options: GenericObject): string;
  public generateDeleteStatement(Model: ModelClass, queryEngine: QueryEngine, options?: GenericObject): string;
  public generateTruncateTableStatement(Model: ModelClass, options?: GenericObject): string;
  public generateAlterTableStatement(Model: ModelClass, newModelAttributes, options?: GenericObject): string;
  public generateDropColumnStatement(field: Field, options?: GenericObject): string;
  public generateAlterColumnRenameStatement(field: Field, newField: Field, options?: GenericObject): string;
  public generateAlterColumnSetOrDropNullConstraintStatement(field: Field, newField: Field, options?: GenericObject): string;
  public generateAlterColumnSetDefaultStatement(field: Field, newField: Field, newDefaultValue: any, options?: GenericObject): string;
  public generateAlterColumnChangeTypeStatement(field: Field, newField: Field, newFieldType: string, options?: GenericObject): string;
  public generateAlterColumnChangePrimaryKeyConstraintStatement(field: Field, newField: Field, options?: GenericObject): string;
  public generateAlterColumnChangeUniqueConstraintStatement(field: Field, newField: Field, options?: GenericObject): string;
  public generateAlterColumnStatements(field: Field, newFieldAttributes: GenericObject, options?: GenericObject): Array<string>;
  public generateAddColumnStatement(field: Field, options?: GenericObject): string;

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
