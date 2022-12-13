'use strict';

const Nife = require('nife');
const {
  Types,
  QueryEngine,
  Utils,
  Literals,
  Model: ModelBase,
  Field,
  QueryGeneratorBase,
} = require('mythix-orm');

const DefaultHelpers  = Types.DefaultHelpers;
const LiteralBase     = Literals.LiteralBase;

/// The "base" SQL generator for all SQL-type databases.
///
/// This class is used to generate SQL statements for the
/// underlying SQL database. Database drivers can and often
/// will create their own class that extends from this class.
///
/// Extends: [QueryGeneratorBase](https://github.com/th317erd/mythix-orm/wiki/QueryGeneratorBase)
class SQLQueryGeneratorBase extends QueryGeneratorBase {
  /// Escape a field name, usually for a projection alias.
  /// This method is primarily used for generating aliases
  /// for projected fields.
  ///
  /// This method will take the field it is given, and turn
  /// it into a fully qualified field name, escaped as an identifier
  /// for the underlying database.
  ///
  /// For example, given the field `User.fields.id`, this method will return
  /// `"User:id"`--assuming that double quotes are used in the underlying
  /// database to escape an identifier.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that owns the `field` provided.
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to operate on.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `fieldNameOnly` | `boolean` | `false` | If `true`, then only use the `fieldName` of the field, ignoring the model name in the operation (resulting in a non-fully-qualified field name) |
  ///
  /// Return: string
  ///   The field's name, escaped for the underlying database. i.e. `"User:id"`.
  getEscapedFieldName(_Model, field, options) {
    let isString  = Nife.instanceOf(field, 'string');
    let fieldName = (isString) ? field : field.fieldName;
    let Model     = _Model;

    if (!Model && field && !isString)
      Model = field.Model;

    if (!Model || (options && options.fieldNameOnly === true))
      return this.escapeID(fieldName);
    else
      return `"${field.Model.getModelName()}:${fieldName}"`;
  }

  /// Get the escaped column name for the field provided.
  ///
  /// Given a field, return the full column name (including the table)
  /// of that field, escaped for the underlying databases.
  /// For example, given the field `User.fields.id`, return `"users"."id"`--assuming
  /// the underlying database uses double quotes for escaping identifiers.
  ///
  /// This method will use the `columnName` defined on the field for the name
  /// of the column, if defined, or will use `fieldName` as defined on the field
  /// as the column name if no `columnName` is defined. To get the name of the table,
  /// this method will use [getTableName](https://github.com/th317erd/mythix-orm/wiki/Model#method-static-getTableName)
  /// on the model that owns the `field` provided.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that owns the `field` provided.
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to operate on.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `columnNameOnly` | `boolean` | `false` | If `true`, then escape only the column name, and don't include the name of the table. |
  ///     | `columnNamePrefix` | `string` | `''` | Prefix the column name with this value before escaping it. |
  ///     | `tableNamePrefix` | `string` | `''` | Only applicable if `columnNameOnly` is `false`. Used to prefix the table name before escaping it. |
  ///
  /// Return: string
  ///   The fully escaped column name, including the table the column exists on. i.e. `"users"."id"`.
  getEscapedColumnName(_Model, field, options) {
    let isString    = Nife.instanceOf(field, 'string');
    let columnName  = (isString) ? field : (field.columnName || field.fieldName);
    let Model       = _Model;

    if (!Model && field && !isString)
      Model = field.Model;

    if (options && options.columnNamePrefix)
      columnName = `${options.columnNamePrefix}${columnName}`;

    if (!Model || (options && options.columnNameOnly === true))
      return this.escapeID(columnName);
    else
      return `${this.getEscapedTableName(Model)}.${this.escapeID(columnName)}`;
  }

  /// Get the escaped table name for the model or field provided.
  ///
  /// Give a model or field, access the model to get the table name
  /// for the model, and escape it for the underlying database.
  /// If given a field, then the parent model for that field will be
  /// retrieved via `field.Model`. Once a model is ascertained, then
  /// call [getTableName](https://github.com/th317erd/mythix-orm/wiki/Model#method-static-getTableName)
  /// on the model to get the table name in the underlying database for this
  /// model, escaping it before it is returned.
  ///
  /// Arguments:
  ///   modelOrField: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model) | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A model class, or a field to fetch the model class from.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `tableNamePrefix` | `string` | `''` | Used to prefix the table name before escaping it. |
  ///
  /// Return: string
  ///   The table name for the given model, escaped for the underlying database. i.e. `"users"`.
  getEscapedTableName(_modelOrField, options) {
    let Model     = (_modelOrField.Model) ? _modelOrField.Model : _modelOrField;
    let tableName = Model.getTableName(this.connection);

    if (options && options.tableNamePrefix)
      tableName = `${options.tableNamePrefix}${tableName}`;

    return this.escapeID(tableName);
  }

  /// Given a field, escape it for the projection,
  /// optionally including an alias for the field.
  ///
  /// For example, given the field `User.fields.id`, return
  /// the projected field with an alias: `"users"."id" AS "User:id"`.
  /// By default, this will use <see>SQLQueryGeneratorBase.getEscapedFieldName</see>
  /// for the alias, unless the `as` `options` is provided. If `as`
  /// is provided to the `options`, then use that as the literal field
  /// alias instead.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that owns the `field` provided.
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to operate on.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, then escape only the column name, and don't include the alias for the projection. |
  ///     | `columnNameOnly` | `boolean` | `false` | If `true`, then escape only the column name, and don't include the name of the table. |
  ///     | `columnNamePrefix` | `string` | `''` | Prefix the column name with this value before escaping it. |
  ///     | `tableNamePrefix` | `string` | `''` | Only applicable if `columnNameOnly` is `false`. Used to prefix the table name before escaping it. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The fully escaped column name, for use in the projection. i.e. `"users"."id" AS "User:id"`.
  // eslint-disable-next-line no-unused-vars
  getEscapedProjectionName(Model, field, options) {
    if (options && options.noProjectionAliases)
      return this.getEscapedColumnName(Model, field, options);
    else
      return `${this.getEscapedColumnName(Model, field, options)} AS ${(options && options.as) ? this.escapeID(options.as) : this.getEscapedFieldName(Model, field, options)}`;
  }

  /// Pass all non-virtual model fields through
  /// <see>SQLQueryGeneratorBase.getEscapedFieldName</see>,
  /// <see>SQLQueryGeneratorBase.getEscapedColumnName</see>,
  /// or <see>SQLQueryGeneratorBase.getEscapedProjectionName</see>.
  ///
  /// This method is used to bulk-escape all model fields, using one
  /// of the methods listed above. If the `asProjection` `options` is
  /// used, then all fields will be escaped using <see>SQLQueryGeneratorBase.getEscapedProjectionName</see>.
  /// If the `asColumn` `options` is used, then escape all fields using
  /// <see>SQLQueryGeneratorBase.getEscapedColumnName</see>. Otherwise,
  /// if no `options` are specified, then escape all model fields using
  /// <see>SQLQueryGeneratorBase.getEscapedFieldName</see> instead.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model whose fields are to be escaped. Only non-virtual fields are operated upon.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `asProjection` | `boolean` | `false` | If `true`, then use <see>SQLQueryGeneratorBase.getEscapedProjectionName</see> to escape the model's fields. |
  ///     | `asColumn` | `boolean` | `false` | If `true`, then use <see>SQLQueryGeneratorBase.getEscapedColumnName</see> to escape the model's fields. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, then escape only the column name, and don't include the alias for the projection. |
  ///     | `columnNameOnly` | `boolean` | `false` | If `true`, then escape only the column name, and don't include the name of the table. |
  ///     | `columnNamePrefix` | `string` | `''` | Prefix the column name with this value before escaping it. |
  ///     | `tableNamePrefix` | `string` | `''` | Only applicable if `columnNameOnly` is `false`. Used to prefix the table name before escaping it. |
  ///
  /// Return: object
  ///   Return an object that maps all escaped model fields. Each key will be the fully qualified name of the field,
  ///   each value will be the escaped field as a string.
  // eslint-disable-next-line no-unused-vars
  getEscapedModelFields(Model, _options) {
    let options   = Object.assign(_options || {}, { as: null });
    let fields    = {};
    let modelName = Model.getModelName();

    Model.iterateFields(({ field, fieldName }) => {
      if (field.type.isVirtual())
        return;

      let result;

      if (options && options.asProjection)
        result = this.getEscapedProjectionName(Model, field, options);
      else if (options && options.asColumn)
        result = this.getEscapedColumnName(Model, field, options);
      else
        result = this.getEscapedFieldName(Model, field, options);

      fields[`${modelName}:${fieldName}`] = result;
    }, (options && options.fields));

    return fields;
  }

  /// Get the `ORDER` clause from the provided [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine).
  /// If none is found, then call [Connection.getDefaultOrder](https://github.com/th317erd/mythix-orm/wiki/ConnectionBase#method-getDefaultOrder)
  /// to get the default order for the operation.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to fetch the `ORDER` clause from.
  ///   options?: object
  ///     The options object provided to the operation that is taking place. This isn't used
  ///     by this method, but instead is passed off to [Connection.getDefaultOrder](https://github.com/th317erd/mythix-orm/wiki/ConnectionBase#method-getDefaultOrder)
  ///     in case the connection (or user) needs the options to produce a default ordering.
  ///
  /// Return: Map<string, { value: Field | Literal | string; direction?: '+' | '-'; ... }>
  ///   Return the field-set for the default ordering to apply to the operation taking place.
  ///   This `Map` should have the same format as is returned by [ModelScope.mergeFields](https://github.com/th317erd/mythix-orm/wiki/ModelScope#method-mergeFields).
  getQueryEngineOrder(queryEngine, _options) {
    let options = _options || {};
    let context = queryEngine.getOperationContext();
    let order   = context.order;

    return (order && order.size) ? order : this.connection.getDefaultOrder(context.rootModel, options);
  }

  /// Get the field projection for the operation taking place.
  ///
  /// This will prepare all fields in the projection, along with
  /// any literals, and will also merge any `ORDER BY` clause fields
  /// into the projection. The result will be either a `Map`, containing
  /// all projected fields and literals, or will be an `Array` of just
  /// the projected fields, escaped and prepared for the underlying database.
  /// A `Map` of the fields will be returned instead of an array if the `asMap`
  /// argument is set to `true`.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to fetch the field projection (and order) from.
  ///   options?: object
  ///     Options for the operation. These options aren't used directly by this method,
  ///     but instead are passed off to the sub-methods that are called to complete the
  ///     operation, such as the `toString` method for literals, the <see>SQLQueryGeneratorBase.getQueryEngineOrder</see>
  ///     to get the field ordering, and to the <see>SQLQueryGeneratorBase.getEscapedProjectionName</see> to
  ///     project the fields.
  ///   asMap: boolean
  ///     If `true`, then return a `Map` of the projected fields, instead of an `Array`. This
  ///     is used for example internally by `SELECT` operations to know which fields were
  ///     projected. Each key in this `Map` is a fully qualified field name (to link the projection
  ///     back to its field), or a fully expanded literal string for literals. The value for each
  ///     property in this map in the projected field or literal value itself, as a string.
  ///
  /// Return: Map<string, string> | Array<string>
  ///   A `Map` of the projected fields if the `asMap` argument is `true`, or an `Array` of the
  ///   projected fields otherwise.
  getProjectedFields(queryEngine, _options, asMap) {
    let options               = this.stackAssign(_options || {}, { isProjection: true });
    let context               = queryEngine.getOperationContext();
    let queryProjection       = new Map(context.projection);
    let order                 = this.getQueryEngineOrder(queryEngine, options);
    let allProjectionFields   = new Map();
    let allModelsUsedInQuery  = queryEngine.getAllModelsUsedInQuery();

    if (!options.isSubQuery && order && order.size) {
      let contextOrderSupport = this.connection.isOrderSupportedInContext(options);
      if (contextOrderSupport) {
        for (let [ fullyQualifiedFieldName, orderScope ] of order) {
          if (!queryProjection.has(fullyQualifiedFieldName))
            queryProjection.set(fullyQualifiedFieldName, orderScope);
        }
      }
    }

    for (let [ fullyQualifiedName, projectedScope ] of queryProjection) {
      let { value } = projectedScope;

      if (Nife.instanceOf(value, 'string')) {
        // Raw string is treated as a literal
        allProjectionFields.set(fullyQualifiedName, value);
        continue;
      } else if (LiteralBase.isLiteral(value)) {
        let result = value.toString(this.connection, options);
        allProjectionFields.set(result || fullyQualifiedName, result || fullyQualifiedName);

        continue;
      }

      if (allModelsUsedInQuery.indexOf(value.Model) < 0)
        continue;

      let escapedFieldName = this.getEscapedProjectionName(value.Model, value, options);
      allProjectionFields.set(`${value.Model.getModelName()}:${value.fieldName}`, escapedFieldName);
    }

    if (asMap === true)
      return allProjectionFields;
    else
      return Array.from(allProjectionFields.values());
  }

  /// Given two "operation contexts" from a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  /// instance, collection the information required to join two tables.
  ///
  /// Using the "left side" context of the operation being calculated, find the "root model"
  /// of the query, and compile table-join information with the "right side" context of
  /// the operation, joining the "root model" on the left-side with the model and field specified on
  /// the right-side of the operation.
  ///
  /// A table-join looks like `User.where.id.EQ(Role.where.userID)`. In this context, the `User.where.id`
  /// would be the "left side", and `Role.where.userID` would be the "right side".
  ///
  /// Interface:
  ///   interface TableJoinInformation {
  ///     operator: string; // The operator used for the table-join, i.e. "EQ"
  ///     joinType: string; // The database specific join-type for the table-join, i.e. "INNER JOIN"
  ///     rootModelName: string; // The name of the "root model" for the query
  ///     joinModel: class Model; // The the model being joined to the "root model"
  ///     joinModelName: string; // The name of the model being joined to the "root model"
  ///     leftSideModel: class Model; // The model on the left-side of the table-join
  ///     leftSideModelName: string; // The name of the model on the left-side of the table-join
  ///     leftQueryContext: object; // The "operation context" of the left-side of the operation
  ///     leftSideField: Field; // The field on the left side of the table-join
  ///     rightSideModel: class Model; // The model on the right-side of the table-join
  ///     rightSideModelName: string; // The model name of the model on the right-side of the table-join
  ///     rightQueryContext: object; // The "operation context" of the right-side of the operation
  ///     rightSideField: Field; // The field on the right-side of the table-join
  ///   }
  ///
  /// Arguments:
  ///   leftQueryContext: object
  ///     The left-side "operation context" of the query engine to compile the "root model" information
  ///     from.
  ///   rightQueryContext: object
  ///     The right-side "operation context" of the query engine to compile the "join model" information
  ///     from.
  ///   joinType: string
  ///     The join-type (LEFT, RIGHT, INNER, CROSS, etc...) for the join-table operation.
  ///   options?: object
  ///     The options for the operation. These aren't used by default by Mythix ORM, and instead are
  ///     provided for the user if the user should overload this method. These will be the options for
  ///     the operation taking place (i.e. a `SELECT` operation).
  ///
  /// Return: TableJoinInformation
  ///   Return an object containing all information needed to generate a table-join query.
  // eslint-disable-next-line no-unused-vars
  getJoinTableInfoFromQueryContexts(leftQueryContext, rightQueryContext, joinType, options) {
    let rootModel         = leftQueryContext.rootModel;
    let rootModelName     = rootModel.getModelName();
    let leftSideModel     = leftQueryContext.Model;
    let leftSideModelName = leftQueryContext.modelName;
    if (!leftSideModel)
      throw new Error(`${this.constructor.name}::getJoinTableInfoFromQueryEngine: Invalid operation: No model found for left-side of join statement.`);

    let leftSideField = leftQueryContext.Field;
    if (!leftSideField)
      throw new Error(`${this.constructor.name}::getJoinTableInfoFromQueryEngine: Invalid operation: No left-side field found to match on for table join statement.`);

    let isNot               = leftQueryContext.not;
    let operator            = (isNot) ? leftQueryContext.inverseOperator : leftQueryContext.operator;
    let rightSideModel      = rightQueryContext.Model;
    let rightSideModelName  = rightQueryContext.modelName;
    if (!rightSideModel)
      throw new Error(`${this.constructor.name}::getJoinTableInfoFromQueryEngine: Invalid operation: No model found for right-side of join statement.`);

    let rightSideField = rightQueryContext.Field;
    if (!rightSideField)
      throw new Error(`${this.constructor.name}::getJoinTableInfoFromQueryEngine: Invalid operation: No right-side field found to match on for table join statement.`);

    let swapJoinRelation    = (rightSideModelName === rootModelName);
    let joinModel           = (swapJoinRelation) ? leftSideModel : rightSideModel;
    let joinModelName       = (swapJoinRelation) ? leftSideModelName : rightSideModelName;

    return {
      operator,
      joinType,
      rootModelName,

      joinModel,
      joinModelName,

      leftSideModel,
      leftSideModelName,
      leftQueryContext,
      leftSideField,

      rightSideModel,
      rightSideModelName,
      rightQueryContext,
      rightSideField,
    };
  }

  /// Get an `AS` projection alias for the literal being stringified,
  /// but only if a projection alias is applicable.
  ///
  /// If the literal is a "sub-field" (i.e. the `FieldLiteral` in `new CountLiteral(new FieldLiteral(...))`)
  /// then don't return a projection alias (i.e. the alias needs to be on `CountLiteral` in this example, not
  /// on the sub-field `FieldLiteral`).
  ///
  /// Also don't return an alias if the `noProjectionAliases` `options` is set to `true`. This might
  /// be the case for example if we are "projecting" the literal for an `ORDER BY` clause.
  ///
  /// Arguments:
  ///   literal: inherits from [LiteralBase](https://github.com/th317erd/mythix-orm/wiki/LiteralBase)
  ///     The literal that is being stringified.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///
  /// Return: string
  ///   An empty string if a field alias isn't allowed, or an ` AS ...` postfix string
  ///   to apply to the stringified `literal` provided if an alias is allowed and requested.
  _getLiteralAlias(literal, options) {
    if (options && options.isSubField)
      return '';

    if (options && options.noProjectionAliases)
      return '';

    let as = (literal.options && literal.options.as) || (options && options.as);
    if (Nife.isEmpty(as))
      return '';

    return ` AS ${this.escapeID(as)}`;
  }

  /// Convert an [AverageLiteral](https://github.com/th317erd/mythix-orm/wiki/AverageLiteral) to
  /// a string for use in the underlying database.
  ///
  /// Arguments:
  ///   literal: [AverageLiteral](https://github.com/th317erd/mythix-orm/wiki/AverageLiteral)
  ///     The [AverageLiteral](https://github.com/th317erd/mythix-orm/wiki/AverageLiteral) to stringify.
  ///   options?: object
  ///     Options for the operation. Listed below are the common options for all literals. There may also be
  ///     literal or connection specific options that can be supplied.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The literal provided, stringified for use in the underlying database.
  _averageLiteralToString(literal, options) {
    if (!literal || !LiteralBase.isLiteral(literal))
      return;

    let field = literal.getField(this.connection);
    let escapedColumnName;

    if (LiteralBase.isLiteral(field))
      escapedColumnName = field.toString(this.connection, this.stackAssign(options, { isSubField: true }));
    else
      escapedColumnName = this.getEscapedColumnName(field.Model, field, this.stackAssign(options, literal.options));

    return `AVG(${escapedColumnName})${this._getLiteralAlias(literal, options)}`;
  }

  /// Convert an [CountLiteral](https://github.com/th317erd/mythix-orm/wiki/CountLiteral) to
  /// a string for use in the underlying database.
  ///
  /// Arguments:
  ///   literal: [CountLiteral](https://github.com/th317erd/mythix-orm/wiki/CountLiteral)
  ///     The [CountLiteral](https://github.com/th317erd/mythix-orm/wiki/CountLiteral) to stringify.
  ///   options?: object
  ///     Options for the operation. Listed below are the common options for all literals. There may also be
  ///     literal or connection specific options that can be supplied.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The literal provided, stringified for use in the underlying database.
  _countLiteralToString(literal, options) {
    if (!literal || !LiteralBase.isLiteral(literal))
      return;

    let field = literal.getField(this.connection);
    let escapedColumnName;

    if (field) {
      if (LiteralBase.isLiteral(field))
        escapedColumnName = field.toString(this.connection, this.stackAssign(options, { isSubField: true }));
      else
        escapedColumnName = this.getEscapedColumnName(field.Model, field, this.stackAssign(options, literal.options));
    } else {
      escapedColumnName = '*';
    }

    return `COUNT(${escapedColumnName})${this._getLiteralAlias(literal, options)}`;
  }

  /// Convert an [DistinctLiteral](https://github.com/th317erd/mythix-orm/wiki/DistinctLiteral) to
  /// a string for use in the underlying database.
  ///
  /// Arguments:
  ///   literal: [DistinctLiteral](https://github.com/th317erd/mythix-orm/wiki/DistinctLiteral)
  ///     The [DistinctLiteral](https://github.com/th317erd/mythix-orm/wiki/DistinctLiteral) to stringify.
  ///   options?: object
  ///     Options for the operation. Listed below are the common options for all literals. There may also be
  ///     literal or connection specific options that can be supplied.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The literal provided, stringified for use in the underlying database.
  _distinctLiteralToString(literal, options) {
    if (!literal || !LiteralBase.isLiteral(literal))
      return;

    let field = literal.getField(this.connection);
    if (!field)
      field = literal.valueOf();

    if (!field)
      return 'DISTINCT';

    if (LiteralBase.isLiteral(field)) {
      let fieldStr = field.toString(this.connection, this.stackAssign(options, { noProjectionAliases: true }));
      if (!fieldStr)
        return '';

      if (options && options.isSubField)
        return `DISTINCT ${fieldStr}`;

      return `DISTINCT ON(${fieldStr})`;
    }

    let escapedColumnName = this.getEscapedColumnName(field.Model, field, this.stackAssign(options, literal.options, { noProjectionAliases: true }));
    if (options && options.isSubField)
      return `DISTINCT ${escapedColumnName}`;

    return `DISTINCT ON(${escapedColumnName})`;
  }

  /// Convert an [FieldLiteral](https://github.com/th317erd/mythix-orm/wiki/FieldLiteral) to
  /// a string for use in the underlying database.
  ///
  /// Arguments:
  ///   literal: [FieldLiteral](https://github.com/th317erd/mythix-orm/wiki/FieldLiteral)
  ///     The [FieldLiteral](https://github.com/th317erd/mythix-orm/wiki/FieldLiteral) to stringify.
  ///   options?: object
  ///     Options for the operation. Listed below are the common options for all literals. There may also be
  ///     literal or connection specific options that can be supplied.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The literal provided, stringified for use in the underlying database.
  _fieldLiteralToString(literal, options) {
    if (!literal || !LiteralBase.isLiteral(literal))
      return;

    let field = literal.getField(this.connection);
    if (LiteralBase.isLiteral(field))
      return field.toString(this.connection, options);

    let noProjectionAliases = (options && (options.isSubField || !options.isProjection || options.as === false));
    return this.getEscapedProjectionName(field.Model, field, this.stackAssign(options, { noProjectionAliases }, literal.options));
  }

  /// Convert an [MaxLiteral](https://github.com/th317erd/mythix-orm/wiki/MaxLiteral) to
  /// a string for use in the underlying database.
  ///
  /// Arguments:
  ///   literal: [MaxLiteral](https://github.com/th317erd/mythix-orm/wiki/MaxLiteral)
  ///     The [MaxLiteral](https://github.com/th317erd/mythix-orm/wiki/MaxLiteral) to stringify.
  ///   options?: object
  ///     Options for the operation. Listed below are the common options for all literals. There may also be
  ///     literal or connection specific options that can be supplied.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The literal provided, stringified for use in the underlying database.
  _maxLiteralToString(literal, options) {
    if (!literal || !LiteralBase.isLiteral(literal))
      return;

    let field = literal.getField(this.connection);
    let escapedColumnName;

    if (LiteralBase.isLiteral(field))
      escapedColumnName = field.toString(this.connection, this.stackAssign(options, { isSubField: true }));
    else
      escapedColumnName = this.getEscapedColumnName(field.Model, field, this.stackAssign(options, literal.options));

    return `MAX(${escapedColumnName})${this._getLiteralAlias(literal, options)}`;
  }

  /// Convert an [MinLiteral](https://github.com/th317erd/mythix-orm/wiki/MinLiteral) to
  /// a string for use in the underlying database.
  ///
  /// Arguments:
  ///   literal: [MinLiteral](https://github.com/th317erd/mythix-orm/wiki/MinLiteral)
  ///     The [MinLiteral](https://github.com/th317erd/mythix-orm/wiki/MinLiteral) to stringify.
  ///   options?: object
  ///     Options for the operation. Listed below are the common options for all literals. There may also be
  ///     literal or connection specific options that can be supplied.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The literal provided, stringified for use in the underlying database.
  _minLiteralToString(literal, options) {
    if (!literal || !LiteralBase.isLiteral(literal))
      return;

    let field = literal.getField(this.connection);
    let escapedColumnName;

    if (LiteralBase.isLiteral(field))
      escapedColumnName = field.toString(this.connection, this.stackAssign(options, { isSubField: true }));
    else
      escapedColumnName = this.getEscapedColumnName(field.Model, field, this.stackAssign(options, literal.options));

    return `MIN(${escapedColumnName})${this._getLiteralAlias(literal, options)}`;
  }

  /// Convert an [SumLiteral](https://github.com/th317erd/mythix-orm/wiki/SumLiteral) to
  /// a string for use in the underlying database.
  ///
  /// Arguments:
  ///   literal: [SumLiteral](https://github.com/th317erd/mythix-orm/wiki/SumLiteral)
  ///     The [SumLiteral](https://github.com/th317erd/mythix-orm/wiki/SumLiteral) to stringify.
  ///   options?: object
  ///     Options for the operation. Listed below are the common options for all literals. There may also be
  ///     literal or connection specific options that can be supplied.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `isSubField` | `boolean` | `false` | If `true`, the engine is reporting that this is a "sub-field", or literal inside a literal... if this is the case, then don't return an `AS` field alias. |
  ///     | `noProjectionAliases` | `boolean` | `false` | If `true`, the engine is reporting that this is part of the query that shouldn't have field aliases, such as an `ORDER BY` clause. |
  ///     | `as` | `string` | `undefined` | If set to a valid string, then this will be used for the `AS` alias of the column instead of the default. |
  ///
  /// Return: string
  ///   The literal provided, stringified for use in the underlying database.
  _sumLiteralToString(literal, options) {
    if (!literal || !LiteralBase.isLiteral(literal))
      return;

    let field = literal.getField(this.connection);
    let escapedColumnName;

    if (LiteralBase.isLiteral(field))
      escapedColumnName = field.toString(this.connection, this.stackAssign(options, { isSubField: true }));
    else
      escapedColumnName = this.getEscapedColumnName(field.Model, field, this.stackAssign(options, literal.options));

    return `SUM(${escapedColumnName})${this._getLiteralAlias(literal, options)}`;
  }

  /// A convenience method that proxies to <see>SQLConnectionBase.prepareArrayValuesForSQL</see>.
  ///
  /// See: SQLConnectionBase.prepareArrayValuesForSQL
  prepareArrayValuesForSQL(array) {
    return this.connection.prepareArrayValuesForSQL(array);
  }

  /// Generate a field projection for a `SELECT` statement.
  /// If a `DISTINCT` operation is in-use, then this will always
  /// prefix any and all fields projected.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to use to generate the field projection from.
  ///   options?: object
  ///     Options that are passed through the operation. These options are
  ///     simply passed to all other sub-methods used in this operation, including
  ///     when stringifying literals.
  ///   projectedFields?: Map<string, string>
  ///     Provide the projected fields if they are already known, instead of compiling them
  ///     again via a call to <see>SQLQueryGeneratorBase.getProjectedFields</see>.
  ///
  /// Return: string
  ///   Return a comma-separated list of projected fields. If any `DISTINCT`
  ///   clause is set on the `queryEngine`, then that will always come first
  ///   in the list of projected fields.
  generateSelectQueryFieldProjection(queryEngine, options, _projectedFields) {
    let projectedFields = (_projectedFields) ? _projectedFields : this.getProjectedFields(queryEngine, options, false);
    let projectedFieldList = Array.from(projectedFields.values()).join(',');

    let distinct = queryEngine.getOperationContext().distinct;
    if (distinct) {
      let result = distinct.toString(this.connection, { isProjection: true });
      return `${result} ${projectedFieldList}`;
    }

    return projectedFieldList;
  }

  /// Convert a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) conditional
  /// operator into the equivalent SQL conditional operator. For example, `EQ` will be converted
  /// to `=` for most values, `IS` (in the case of `null`, `true`, and `false`), or an `IN` operator
  /// if an array of values is provided.
  ///
  /// If a literal is provided, then it will be converted to a string using the literal's `toString`
  /// method and returned.
  ///
  /// Standard conversion table for most SQL connections (results might differ based on the SQL
  /// connection being used):
  /// | `QueryEngine` Operator | `Array<any>` | `null` | `true` | `false` | Table Join | Other |
  /// | -------------------- | ------------ | ------ | ------ | ------- | ---------- | ----- |
  /// | `EQ` | `IN` | `IS NULL` | `IS TRUE` | `IS FALSE` | `=` | `=` |
  /// | `NEQ` | `NOT IN` | `IS NOT NULL` | `IS NOT TRUE` | `IS NOT FALSE` | `!=` | `!=` |
  /// | `GT` | `throw TypeError` | `>` | `>` | `>` | `>` | `>` |
  /// | `GTE` | `throw TypeError` | `>=` | `>=` | `>=` | `>=` | `>=` |
  /// | `LT` | `throw TypeError` | `<` | `<` | `<` | `<` | `<` |
  /// | `LTE` | `throw TypeError` | `<=` | `<=` | `<=` | `<=` | `<=` |
  /// | `LIKE` | `throw TypeError` | `throw TypeError` | `throw TypeError` | `throw TypeError` | `throw TypeError` | `LIKE` |
  /// | `NOT_LIKE` | `throw TypeError` | `throw TypeError` | `throw TypeError` | `throw TypeError` | `throw TypeError` | `NOT LIKE` |
  ///
  /// Arguments:
  ///   queryPart: object
  ///     The `QueryEngine` "operation frame" for this conditional operation.
  ///   operator: string | Literal
  ///     The `QueryEngine` operator to convert to SQL syntax. If a literal is provided,
  ///     then it will simply be stringified and returned (as the literal operator the user
  ///     specified... whatever that might be).
  ///   value: any
  ///     The right-hand-side value for this conditional operator.
  ///   valueIsReference: boolean
  ///     If `true`, then this operator is being converted for a table-join operation. If this is
  ///     the case, then `value` will be the "operation context" for the right-side of the table-join.
  ///   options?: object
  ///     Options for the operation. This is only used by this method for converting provided literals to strings.
  ///
  /// Return: string
  ///   Return SQL syntax for this context-specific conditional operator.
  generateSelectQueryOperatorFromQueryEngineOperator(queryPart, operator, value, valueIsReference, options) {
    if (LiteralBase.isLiteral(operator))
      return operator.toString(this.connection, options);

    switch (operator) {
      case 'EQ':
        if (valueIsReference)
          return '=';

        if (value === null || value === true || value === false)
          return 'IS';
        else if (Array.isArray(value))
          return 'IN';
        else
          return '=';
      case 'NEQ':
        if (valueIsReference)
          return '!=';

        if (value === null || value === true || value === false)
          return 'IS NOT';
        else if (Array.isArray(value))
          return 'NOT IN';
        else
          return '!=';
      case 'GT':
        if (Array.isArray(value))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: Array of values provided to "GT" (greater than) operator.`);

        return '>';
      case 'GTE':
        if (Array.isArray(value))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: Array of values provided to "GTE" (greater than or equal to) operator.`);

        return '>=';
      case 'LT':
        if (Array.isArray(value))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: Array of values provided to "LT" (less than) operator.`);

        return '<';
      case 'LTE':
        if (Array.isArray(value))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: Array of values provided to "LTE" (less than or equal to) operator.`);

        return '<=';
      case 'LIKE':
        if (valueIsReference)
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "LIKE" operator can not be used for table joins.`);

        if (!Nife.instanceOf(value, 'string'))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "LIKE" operator requires a string for a value.`);

        return 'LIKE';
      case 'NOT_LIKE':
        if (valueIsReference)
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "NOT LIKE" operator can not be used for table joins.`);

        if (!Nife.instanceOf(value, 'string'))
          throw new TypeError(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: The "NOT LIKE" operator requires a string for a value.`);

        return 'NOT LIKE';
      default:
        throw new Error(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: Unknown operator "${operator}".`);
    }
  }

  /// Format a `LIKE` or `NOT LIKE` value.
  ///
  /// Mythix ORM requires that `%` and `_` characters be used for
  /// wildcard characters in `LIKE` and `NOT_LIKE` operations. This is to
  /// create a unified standard for `LIKE` operations across databases.
  /// If the underlying database uses different wildcard characters for
  /// a `LIKE` operation, then it is required to convert them to its native
  /// format here in this method.
  ///
  /// Interface:
  ///   interface QueryConditionContext {
  ///     queryPart: object; // The "operation frame" or "operation context" for this condition
  ///     field: Field; // The field for this conditional operator
  ///     sqlOperator: string; // The SQL operator that matches "operator" in the given context
  ///     operator: string; // The QueryEngine operator for this condition, i.e. "EQ"
  ///     value: any; // The conditional operator's value (right-hand-side value)
  ///   }
  ///
  /// Arguments:
  ///   context: QueryConditionContext
  ///     The "conditional operator" context for this `LIKE` or `NOT LIKE` condition.
  ///
  /// Return: string
  ///   By default simply return `context.value`. Other database drivers may
  ///   format `context.value` before returning it, in a format suitable for
  ///   the underlying database.
  formatLikeValue({ value }) {
    return value;
  }

  /// Generate an optional postfix for any given conditional operator.
  ///
  /// This might be used by any given underlying database should it need
  /// it. It is most commonly used by `LIKE` conditional operators to tag
  /// on an `ESCAPE` clause, specifying the escape character for the `LIKE`
  /// operator. However, it may be used for any operator where the database
  /// needs a "postfix" for the condition.
  ///
  /// Interface:
  ///   interface QueryConditionContext {
  ///     queryPart: object; // The "operation frame" or "operation context" for this condition
  ///     field: Field; // The field for this conditional operator
  ///     sqlOperator: string; // The SQL operator that matches "operator" in the given context
  ///     operator: string; // The QueryEngine operator for this condition, i.e. "EQ"
  ///     value: any; // The conditional operator's value (right-hand-side value)
  ///   }
  ///
  /// Arguments:
  ///   context: QueryConditionContext
  ///     The "conditional operator" context for the current operator being generated.
  ///
  /// Return: string
  ///   By default, simply return an empty string, meaning that there is no postfix
  ///   for the condition being generated. Optionally, the database driver can return any postfix
  ///   for the conditional operator being generated.
  // eslint-disable-next-line no-unused-vars
  generateConditionPostfix(context) {
    return '';
  }

  /// Generate a SQL "conditional operator" for a `WHERE` clause.
  ///
  /// Even though this is generally used for `SELECT` statements, it
  /// may also be used for `UPDATE WHERE ...`, or `DELETE WHERE ...`
  /// statements as well.
  ///
  /// This method should return a fully formatted "conditional" statement
  /// for the query's `WHERE` clause.
  ///
  /// Arguments:
  ///   queryPart: object
  ///     The "operation frame" or "operation context" of the conditional
  ///     operation as found on the `QueryEngine` being used to generate the
  ///     query.
  ///   value: any
  ///     The value (right-hand-side) of the conditional operator being generated.
  ///   options?: object
  ///     Options for the current database operation.
  ///
  /// Return: string
  ///   A fully formatted SQL conditional statement. This may be an `EXISTS`,
  ///   an `ANY` or `ALL`, an `IN`, or some other valid condition for the query.
  ///   i.e. `"users"."id" = 1`.
  generateSelectQueryCondition(queryPart, _value, options) {
    let value     = _value;
    let field     = queryPart.Field;
    let isNot     = queryPart.not;
    let operator  = (isNot) ? queryPart.inverseOperator : queryPart.operator;

    if (operator === 'EXISTS' || operator === 'NOT EXISTS')
      return `${operator}(${this.generateSelectStatement(value.clone().PROJECT(new Literals.Literal('1')).LIMIT(1).OFFSET(0), this.stackAssign(options, { isSubQuery: true, subQueryOperator: operator }))})`;

    // If the value is an array, then handle the
    // special "IN" case for an array
    if (Array.isArray(value)) {
      if (operator !== 'EQ' && operator !== 'NEQ')
        throw new Error(`${this.constructor.name}::generateSelectQueryCondition: Invalid value provided to operator "${operator}": `, value);

      // Flatten array, filter down to
      // only unique items, and remove
      // anything that we can't match on
      // (such as "undefined", and objects)
      value = this.prepareArrayValuesForSQL(value);

      // Filter out NULL, TRUE, and FALSE,
      // as these will need to be compared
      // with "IS" or "IS NOT" operators
      let specialValues = value.filter((item) => (item === null || item === false || item === true));

      // See what remains (if anything)
      let arrayValues = value.filter((item) => (item !== null && item !== false && item !== true));

      // If we have special values, then build a
      // condition enclosed in parenthesis
      if (specialValues.length > 0) {
        let subParts = specialValues.map((specialValue) => {
          return this.generateSelectQueryCondition(queryPart, specialValue, options);
        });

        if (arrayValues.length > 0)
          subParts.push(this.generateSelectQueryCondition(queryPart, arrayValues, options));

        return `(${subParts.join((operator === 'NEQ') ? ' AND ' : ' OR ')})`;
      }

      // If no values left in array, then
      // skip condition altogether
      if (Nife.isEmpty(arrayValues))
        throw new Error(`${this.constructor.name}::generateSelectQueryCondition: Array value provided to "${field.fieldName}.${operator}" can not be empty.`);

      // Otherwise, fall-through
      value = arrayValues;
    }

    let escapedColumnName = this.getEscapedColumnName(field.Model, field, options);
    let sqlOperator       = this.generateSelectQueryOperatorFromQueryEngineOperator(queryPart, operator, value, false, options);

    if (QueryEngine.isQuery(value)) {
      if (!value.queryHasConditions())
        return '';

      if (Object.prototype.hasOwnProperty.call(queryPart, 'subType') && (queryPart.subType === 'ANY' || queryPart.subType === 'ALL'))
        return `${escapedColumnName} ${sqlOperator} ${queryPart.subType}(${this.generateSelectStatement(value, this.stackAssign(options, { isSubQuery: true, subQueryOperator: queryPart.subType }))})`;

      if (sqlOperator === '=')
        sqlOperator = 'IN';
      else if (sqlOperator === '!=')
        sqlOperator = 'NOT IN';

      return `${escapedColumnName} ${sqlOperator} (${this.generateSelectStatement(value, this.stackAssign(options, { isSubQuery: true, subQueryOperator: sqlOperator }))})`;
    }

    let context = { queryPart, field, sqlOperator, operator, value };
    if (sqlOperator === 'LIKE' || sqlOperator === 'NOT LIKE')
      value = this.formatLikeValue(context);

    let conditionPostfix = this.generateConditionPostfix(context);

    return `${escapedColumnName} ${sqlOperator} ${this.escape(field, value)}${(conditionPostfix) ? ` ${conditionPostfix}` : ''}`;
  }

  /// Generate a table join statement, such as
  /// `INNER JOIN "table_name"`, or a `FROM` statement
  /// if `joinType` is falsy, such as `FROM "table_name"`.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table for the operation.
  ///   joinType: string | null
  ///     If a falsy value, then generate a `FROM "table_name"` statement, using
  ///     the provided `Model` to know the table name. If a string, then this will
  ///     be a join-type, such as `INNER JOIN`, which will be used instead of `FROM`,
  ///     i.e. `INNER JOIN "table_name"`.
  ///   options?: object
  ///     Options to provide to <see>SQLQueryGeneratorBase.getEscapedTableName</see> for the operation.
  ///
  /// Return: string
  ///   A `FROM "table_name"` statement, or a table join statement, such as
  ///   `INNER JOIN "table_name"`.
  generateFromTableOrTableJoin(Model, _joinType, options) {
    if (!Model)
      throw new Error(`${this.constructor.name}::generateFromTableOrTableJoin: No valid model provided.`);

    let escapedTableName = this.getEscapedTableName(Model, options);
    let joinType = _joinType;
    if (joinType && LiteralBase.isLiteral(joinType))
      joinType = joinType.toString(this.connection);

    return (joinType) ? `${joinType} ${escapedTableName}` : `FROM ${escapedTableName}`;
  }

  /// Given a table-join query operation, such as `User.where.id.EQ(Role.where.userID)`,
  /// generate the table-join statement.
  ///
  /// Continuing with the example provided, this would generate the following SQL,
  /// `"users"."id" = "roles"."userID"`.
  ///
  /// Arguments:
  ///   leftQueryPart: object
  ///     The "operation frame" or "operation context" for the left-side of the statement.
  ///     In this example this would be the `EQ` "operation context" of `User.where.id.EQ`.
  ///   rightQueryPart: object
  ///     The "operation frame" or "operation context" for the right-side of the statement.
  ///     In this example this would be the `userID` "operation context" of `Role.where.userID`.
  ///   leftField: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The left-hand side field for the condition. In this example this would be `User.fields.id`.
  ///   rightField: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The right-hand side field for the condition. In this example this would be `Role.fields.userID`.
  ///   operator: string
  ///     The [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) operator to join the
  ///     table columns on... i.e. `EQ`. This will be passed through <see>SQLQueryGeneratorBase.generateSelectQueryOperatorFromQueryEngineOperator</see>
  ///     to get the related SQL operator for the condition.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   Return the table-join condition, i.e. `"users"."id" = "roles"."userID"`.
  generateSelectJoinOnTableQueryCondition(leftQueryPart, rightQueryPart, leftField, rightField, operator, options) {
    let leftSideEscapedColumnName   = this.getEscapedColumnName(leftField.Model, leftField, options);
    let rightSideEscapedColumnName  = this.getEscapedColumnName(rightField.Model, rightField, options);
    let sqlOperator                 = this.generateSelectQueryOperatorFromQueryEngineOperator(leftQueryPart, operator, rightQueryPart, true, options);

    return `${leftSideEscapedColumnName} ${sqlOperator} ${rightSideEscapedColumnName}`;
  }

  /// Take the join table information from a call to
  /// <see>SQLQueryGeneratorBase.getJoinTableInfoFromQueryContexts</see>
  /// and generate all table-join conditions for the two
  /// tables being joined.
  ///
  /// The will generate one or more conditions for the table-join,
  /// using `AND` or `OR` to combine the conditions.
  /// For example, this might generate the following SQL code:
  /// `INNER JOIN "roles" ON "users"."id" = "roles"."userID" OR "users"."fullName" = "roles"."userFullName"`.
  ///
  /// Arguments:
  ///   joinInfos: Array<TableJoinInformation>
  ///     All collected table-join information for joining tables. The join table
  ///     information at index zero `joinInfos[0]` is the table being joined against,
  ///     which is commonly the "root model" of the query... but it doesn't have to be.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   The full list of conditions for joining the tables together, i.e.
  ///   `INNER JOIN "roles" ON "users"."id" = "roles"."userID" OR "users"."fullName" = "roles"."userFullName"`.
  ///
  /// See: SQLQueryGeneratorBase.getJoinTableInfoFromQueryContexts
  generateJoinOnTableQueryConditions(joinInfos, options) {
    if (Nife.isEmpty(joinInfos))
      return '';

    let rootInfo = joinInfos[0];
    let sqlParts = [
      this.generateFromTableOrTableJoin(rootInfo.joinModel, rootInfo.joinType, options),
      'ON',
    ];

    for (let i = 0, il = joinInfos.length; i < il; i++) {
      let joinInfo = joinInfos[i];

      if (i > 0)
        sqlParts.push((joinInfo.leftQueryContext.and) ? 'AND' : 'OR');

      sqlParts.push(this.generateSelectJoinOnTableQueryCondition(joinInfo.rightQueryContext, joinInfo.leftQueryContext, joinInfo.rightSideField, joinInfo.leftSideField, joinInfo.operator, options));
    }

    return sqlParts.join(' ');
  }

  /// Take a join type from a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  /// instance, and convert it to the proper join type for the underlying database.
  ///
  /// Arguments:
  ///   joinType: string
  ///     The join type, as specified by the [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine). This
  ///     will generally be one of `'inner'`, `'left'`, `'right'`, `'full'`, or `'cross'`, but
  ///     it might also be a user-defined table join type (in which case is is expected to already
  ///     be in the correct format for the underlying database).
  ///   outer: boolean
  ///     If `true`, then this is an "outer join", instead of an "inner join". i.e. a `'left'` join
  ///     type would be converted to a `LEFT OUTER JOIN` instead of a `LEFT INNER JOIN`.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   The SQL join type, used to join tables. i.e. `LEFT JOIN`.
  // eslint-disable-next-line no-unused-vars
  generateSQLJoinTypeFromQueryEngineJoinType(joinType, outer, options) {
    if (!joinType || joinType === 'inner')
      return 'INNER JOIN';
    else if (joinType === 'left')
      return (outer) ? 'LEFT OUTER JOIN' : 'LEFT JOIN';
    else if (joinType === 'right')
      return (outer) ? 'RIGHT OUTER JOIN' : 'RIGHT JOIN';
    else if (joinType === 'full')
      return (outer) ? 'FULL OUTER JOIN' : 'FULL JOIN';
    else if (joinType === 'cross')
      return 'CROSS JOIN';

    return joinType;
  }

  /// Sort the table joins into a predictable order.
  ///
  /// Since table-join operations can exist anywhere in a query,
  /// this will take all table-join operations for the query, and
  /// sort them so that they are in a predictable order.
  /// By default the order will be in "dependency order", so if for
  /// example there is a join against the `Role` table, and the `Role`
  /// table "depends on" the `User` table, then the `Role` table will
  /// come first in the list of table joins.
  ///
  /// Why sort the table joins at all? Mythix ORM always does its best to
  /// keep all queries consistent, if for no other reason than for caching
  /// purposes (so the query itself can be used as a cache key).
  ///
  /// Arguments:
  ///   joins: Map<string, Array<TableJoinInformation>>
  ///     A map of all table-joins taking place. Each key in this map is the name
  ///     of a model being joined. Each value is an array of `TableJoinInformation`
  ///     that defines how two tables will be joined to each other. This array is
  ///     what is sorted with this operation.
  ///
  /// Return: Array<string>
  ///   An array of model names, sorted in order, used as "ordered keys"
  ///   into the provided `Map` to generate the table-joins for the query.
  ///
  /// See: SQLQueryGeneratorBase.getJoinTableInfoFromQueryContexts
  sortJoinRelationOrder(joins) {
    let modelNames = Array.from(joins.keys());

    return Utils.sortModelNamesByDependencyOrder(this.connection, modelNames, (Model, modelName) => {
      let joinInfos     = joins.get(modelName) || [];
      let dependencies  = [];

      for (let i = 0, il = joinInfos.length; i < il; i++) {
        let joinInfo = joinInfos[i];

        if (joinInfo.rightSideModelName !== modelName)
          dependencies.push(joinInfo.rightSideModelName);

        if (joinInfo.leftSideModelName !== modelName)
          dependencies.push(joinInfo.leftSideModelName);
      }

      return dependencies;
    });
  }

  /// Generate the SQL syntax needed to join all tables in the operation.
  ///
  /// For example, this might generate the following SQL
  /// `INNER JOIN "roles" ON "users"."id" = "roles"."userID" RIGHT JOIN "organizations" ON "organization"."id" = "roles"."organizationID"`.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull table-join operations from.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   A complete join of all tables in the operation that are being joined, including
  ///   the conditions used to join each table.
  ///
  /// See: SQLQueryGeneratorBase.getJoinTableInfoFromQueryContexts
  generateSelectQueryJoinTables(queryEngine, options) {
    const addToJoins = (joinInfo) => {
      let items = joins.get(joinInfo.joinModelName);
      if (!items) {
        items = [];
        joins.set(joinInfo.joinModelName, items);
      }

      items.push(joinInfo);
    };

    let query = queryEngine.getOperationStack();
    let joins = new Map();

    for (let i = 0, il = query.length; i < il; i++) {
      let queryPart = query[i];
      if (!(Object.prototype.hasOwnProperty.call(queryPart, 'condition') && queryPart.condition === true))
        continue;

      let operatorValue = queryPart.value;
      if (!QueryEngine.isQuery(operatorValue))
        continue;

      // If the query has a condition, then it is a sub-query
      // not a join
      if (operatorValue.getOperationContext().condition)
        continue;

      let joinType = this.generateSQLJoinTypeFromQueryEngineJoinType(queryPart.joinType, queryPart.joinOuter, options);
      let joinInfo = this.getJoinTableInfoFromQueryContexts(queryPart, operatorValue.getOperationContext(), joinType, options);

      addToJoins(joinInfo);
    }

    // We sort the order of joins because
    // some databases care very much
    let modelNames  = this.sortJoinRelationOrder(joins);
    let sqlParts    = [];

    for (let i = 0, il = modelNames.length; i < il; i++) {
      let modelName = modelNames[i];
      let joinInfos = joins.get(modelName);

      let sqlStr = this.generateJoinOnTableQueryConditions(joinInfos, options);
      sqlParts.push(sqlStr);
    }

    return sqlParts.join(' ');
  }

  /// Generate all `WHERE` conditions using the provided
  /// [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine).
  ///
  /// This will take all conditional operations defined by the query engine,
  /// and generate a full `WHERE` condition, `AND`ing or `OR`ing all conditions
  /// together, including grouping and sub-grouping conditions where needed.
  ///
  /// Note:
  ///   This method can be recursively called if a sub-query is encountered that
  ///   also has `WHERE` conditions.
  ///
  /// Note:
  ///   Even though this method's name implies generating `WHERE` conditions for a `SELECT`
  ///   statement, it is also used for non-SELECT statements, such as `UPDATE WHERE ...`,
  ///   and `DELETE WHERE ...`.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull conditions from.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   All SQL conditional operators for a `WHERE` statement, not including the
  ///   `WHERE` prefix. i.e. `"users"."id" = 1 OR "users"."firstName" = 'Bob'`. An
  ///   empty string will be returned if there are no conditional operators used in
  ///   the provided query engine.
  generateSelectWhereConditions(queryEngine, options) {
    const logicalCondition = (sqlParts, queryPart) => {
      if (sqlParts.length === 0)
        return '';

      if (queryPart.and)
        return 'AND ';
      else if (queryPart.or)
        return 'OR ';

      return '';
    };

    let query     = queryEngine.getOperationStack();
    let sqlParts  = [];
    let hasValue  = false;

    for (let i = 0, il = query.length; i < il; i++) {
      let queryPart     = query[i];
      let queryOperator = queryPart.operator;
      let queryValue    = queryPart.value;
      let result        = undefined;

      if (Object.prototype.hasOwnProperty.call(queryPart, 'condition')) {
        if (queryPart.condition !== true)
          continue;

        result = this.generateSelectQueryCondition(queryPart, queryValue, options);
      } else if (Object.prototype.hasOwnProperty.call(queryPart, 'logical')) {
        if (queryOperator === 'NOT')
          continue;

        // If we have a value for the logical operator
        // then that means we have a sub-grouping
        if (Object.prototype.hasOwnProperty.call(queryPart, 'value') && QueryEngine.isQuery(queryValue)) {
          result = this.generateSelectWhereConditions(queryValue, options);
          if (result)
            result = `(${result})`;
        }
      }

      if (result) {
        let finalResult = `${logicalCondition(sqlParts, queryPart)}${result}`;

        if (sqlParts[0] !== result && sqlParts.indexOf(finalResult) < 0) {
          sqlParts.push(finalResult);
          hasValue = true;
        }
      }
    }

    if (!hasValue)
      return '';

    // Trim any trailing "NOT", "OR", or "AND"
    // from the parts
    let lastIndex = sqlParts.length;
    // eslint-disable-next-line no-unreachable-loop
    for (let i = sqlParts.length - 1; i >= 0; i--) {
      let part = sqlParts[i];
      if (part === 'NOT' || part === 'OR' || part === 'AND') {
        lastIndex = i;
        continue;
      }

      break;
    }

    if (lastIndex < sqlParts.length)
      sqlParts = sqlParts.slice(0, lastIndex);

    return sqlParts.join(' ');
  }

  /// Generate an `ORDER BY` clause, listing all columns
  /// and their sort-direction.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull the "order by" fields from.
  ///   options?: object
  ///     Options for the operation. Though these might be database specific, there are some
  ///     common options that can be supplied to this method:
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `onlyProjectedFields` | `boolean` | `true` | If `true`, then only list fields that are also in the projection. |
  ///     | `projectionFields` | `Map<string, object>` | Result of `getProjectedFields` | The fields that have been projected, to be used in combination with the `onlyProjectedFields` option. |
  ///     | `rawOrder` | `boolean` | `false` | If `true`, then return the order fields (and literals) as a raw Array instead of a comma-separated list of fields. |
  ///     | `reverseOrder` | `boolean` | `false` | If `true`, then reverse the sort order of all fields. |
  ///
  /// Return: string | Array<string>
  ///   If the `rawOrder` `options` is `false`, then return a fully completed `ORDER BY` clause,
  ///   listing all the fields and their sort order. If no order has been specified by the query engine
  ///   (or the connection), then return an empty string instead. If the `rawOrder` `options` is `true`,
  ///   then return an array of the ordered fields instead.
  generateOrderClause(queryEngine, _options) {
    if (!queryEngine || typeof queryEngine.getOperationContext !== 'function')
      return (_options && _options.rawOrder) ? [] : '';

    let options = _options || {};
    let order   = this.getQueryEngineOrder(queryEngine, _options);
    if (!order || !order.size)
      return (options.rawOrder) ? [] : '';

    let contextOrderSupport = this.connection.isOrderSupportedInContext(options);
    if (contextOrderSupport === false)
      return (options.rawOrder) ? [] : '';

    let allModelsUsedInQuery  = queryEngine.getAllModelsUsedInQuery();
    let orderByParts          = [];

    for (let [ fullyQualifiedFieldName, orderScope ] of order) {
      let { value, direction } = orderScope;

      // Only allow fields that are in our projection
      if (options.projectionFields && options.onlyProjectedFields !== false) {
        if (!options.projectionFields.has(fullyQualifiedFieldName) && contextOrderSupport === 'PROJECTION_ONLY')
          continue;
      }

      let finalResult;

      if (Nife.instanceOf(value, 'string')) {
        // Raw string is treated as a literal
        finalResult = value;
      } else if (LiteralBase.isLiteral(value)) {
        finalResult = value.toString(this.connection, options);

        // fullyQualifiedFieldName is the stringified
        // literal here.
        if (options.projectionFields && !options.projectionFields.has(finalResult) && contextOrderSupport === 'PROJECTION_ONLY')
          continue;
      } else {
        if (allModelsUsedInQuery.indexOf(value.Model) < 0)
          continue;

        finalResult = this.getEscapedColumnName(value.Model, value.columnName, options);
      }

      let orderStr;
      if (options.reverseOrder !== true)
        orderStr = (direction === '-') ? 'DESC' : 'ASC';
      else
        orderStr = (direction === '-') ? 'ASC' : 'DESC';

      orderByParts.push(`${finalResult} ${orderStr}`);
    }

    if (Nife.isEmpty(orderByParts))
      return (options.rawOrder) ? [] : '';

    return (options.rawOrder) ? orderByParts : `ORDER BY ${orderByParts.join(',')}`;
  }

  /// Generate a `GROUP BY` clause, listing all columns
  /// to group by.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull the "group by" fields from.
  ///   options?: object
  ///     Options for the operation. Though these might be database specific, there are some
  ///     common options that can be supplied to this method:
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `rawGroupBy` | `boolean` | `false` | If `true`, then return the group by fields (and literals) as a raw Array instead of a comma-separated list of fields. |
  ///
  /// Return: string | Array<string>
  ///   If the `rawGroupBy` `options` is `false`, then return a fully completed `GROUP BY` clause,
  ///   listing all the columns and literals to group by. If no "group by" has been specified by the query engine
  ///   then return an empty string instead. If the `rawGroupBy` `options` is `true`,
  ///   then return an array of the "group by" fields instead.
  generateGroupByClause(queryEngine, _options) {
    if (!queryEngine || typeof queryEngine.getOperationContext !== 'function')
      return (_options && _options.rawGroupBy) ? [] : '';

    let options = _options || {};
    let groupBy = queryEngine.getOperationContext().groupBy;
    if (!groupBy || !groupBy.size)
      return (options.rawGroupBy) ? [] : '';


    let groupByParts  = [];
    for (let groupByScope of groupBy.values()) {
      let { value } = groupByScope;
      let finalResult;

      if (Nife.instanceOf(value, 'string')) {
        // Raw string is treated as a literal
        finalResult = value;
      } else if (LiteralBase.isLiteral(value)) {
        finalResult = value.toString(this.connection, options);
      } else {
        finalResult = this.getEscapedColumnName(value.Model, value.columnName, options);
      }

      groupByParts.push(finalResult);
    }

    if (Nife.isEmpty(groupByParts))
      return (options.rawGroupBy) ? [] : '';

    return (options.rawGroupBy) ? groupByParts : `GROUP BY ${groupByParts.join(',')}`;
  }

  /// Generate a `HAVING` clause to be used in combination with a
  /// `GROUP BY` clause.
  ///
  /// This simple calls <see>SQLQueryGeneratorBase.generateSelectWhereConditions</see>
  /// on the provided `queryEngine`, and if there is a result, wraps the conditions generated
  /// inside a `HAVING (...)` clause. If no conditions are generated, then an empty string will
  /// be returned instead.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull the "group by" conditions from.
  ///   options?: object
  ///     Options for the operation. These options are simply passed through to the
  ///     <see>SQLQueryGeneratorBase.generateSelectWhereConditions</see> call.
  ///
  /// Return: string
  ///   A `HAVING (...)` clause if conditions were found on the provided `queryEngine`, or
  ///   an empty string if no conditions were found.
  ///
  /// See: SQLQueryGeneratorBase.generateSelectWhereConditions
  generateHavingClause(queryEngine, options) {
    let where = this.generateSelectWhereConditions(queryEngine, options);
    return (where) ? `HAVING (${where})` : '';
  }

  /// Generate both a `GROUP BY` and `HAVING` clause
  /// together. If no `GROUP_BY` operation is set on the
  /// provided `queryEngine`, then nothing will be generated,
  /// and an empty string will be returned instead. The `HAVING`
  /// clause will be automatically skipped if there is no
  /// `GROUP_BY` operation to work off of.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull the "group by" clause, and "having" conditions from.
  ///   options?: object
  ///     Options for the operation. These options are simply passed through to the
  ///     <see>SQLQueryGeneratorBase.generateGroupByClause</see> and <see>SQLQueryGeneratorBase.generateHavingClause</see>
  ///     internal calls this method makes.
  ///
  /// Return: string
  ///   A full `GROUP BY` clause, including any `HAVING` clause specified. An empty string
  ///   will be returned if there is no `GROUP_BY` operation specified on the `queryEngine`
  ///   provided.
  ///
  /// See: SQLQueryGeneratorBase.generateGroupByClause
  ///
  /// See: SQLQueryGeneratorBase.generateHavingClause
  generateGroupByAndHavingClause(queryEngine, options) {
    if (!queryEngine)
      return '';

    let sqlParts          = [];
    let groupByStatement  = this.generateGroupByClause(queryEngine, options);
    if (groupByStatement)
      sqlParts.push(groupByStatement);
    else
      return '';

    let having = queryEngine.getOperationContext().having;
    if (having) {
      let havingStatement = this.generateHavingClause(having, options);
      if (havingStatement)
        sqlParts.push(havingStatement);
    }

    return sqlParts.join(' ');
  }

  /// Generate a `LIMIT` clause.
  ///
  /// Arguments:
  ///   limit: number | Literal
  ///     If `limit` is a literal, simply stringify and return it. Otherwise, if `limit`
  ///     is a `number`, generate a `LIMIT` clause and return it, using the `limit` provided.
  ///   options?: object
  ///     Options for the operation. These are passed to `toString` for stringifying literals.
  ///
  /// Return: string
  ///   A `LIMIT` clause to apply to the query.
  generateLimitClause(limit, options) {
    if (LiteralBase.isLiteral(limit))
      return limit.toString(this.connection, options);

    return `LIMIT ${limit}`;
  }

  /// Generate an `OFFSET` clause.
  ///
  /// Arguments:
  ///   offset: number | Literal
  ///     If `offset` is a literal, simply stringify and return it. Otherwise, if `offset`
  ///     is a `number`, generate an `OFFSET` clause and return it, using the `offset` provided.
  ///   options?: object
  ///     Options for the operation. These are passed to `toString` for stringifying literals.
  ///
  /// Return: string
  ///   An `OFFSET` clause to apply to the query.
  generateOffsetClause(offset, options) {
    if (LiteralBase.isLiteral(offset))
      return offset.toString(this.connection, options);

    return `OFFSET ${offset}`;
  }

  /// Generate the `ORDER`, `LIMIT`, and `OFFSET` clauses
  /// to apply to the query. If any one of these clauses is
  /// blank, then it will be skipped. If there is no order,
  /// limit, or offset applied to the query, then an empty
  /// string will be returned.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull the "order by", "limit", and "offset" clauses from.
  ///   options?: object
  ///     Options for the operation. These options are simply passed through to the
  ///     the respective calls that generate the sub-parts of this operation.
  ///
  /// Return: string
  ///   A combo `ORDER BY ... LIMIT ... OFFSET ...` clause to apply to the query.
  ///   If any one of these sub-parts is empty or invalid, they will be skipped.
  ///   i.e. if there is no `LIMIT` applied to the query, then the `LIMIT` and `OFFSET`
  ///   will be skipped. If there is no output because all sub-parts (clauses) were skipped,
  ///   then an empty string will be returned instead.
  generateSelectOrderLimitOffset(queryEngine, _options) {
    if (!queryEngine)
      return '';

    let options = _options || {};
    let context = queryEngine.getOperationContext();
    let {
      order,
      limit,
      offset,
    } = context;

    let sqlParts = [];
    let hasOrder = false;
    let hasLimit = (Nife.instanceOf(limit, 'number') && isFinite(limit));

    if (options.orderClause !== false && !(options.orderClauseOnlyIfLimited === true && !hasLimit) && this.connection.isOrderSupportedInContext(options)) {
      let result = this.generateOrderClause(queryEngine, options);
      if (result) {
        hasOrder = true;
        sqlParts.push(result);
      }

      if (hasOrder && !hasLimit && options && options.forceLimit) {
        limit = options.forceLimit;
        offset = 0;
      }
    }

    if (!Object.is(limit, Infinity) && Nife.isNotEmpty(limit)) {
      if (this.connection.isLimitSupportedInContext(options)) {
        let result = this.generateLimitClause(limit, options);
        if (result)
          sqlParts.push(result);
      }
    }

    if (Nife.isNotEmpty(offset)) {
      if (this.connection.isLimitSupportedInContext(options)) {
        let result = this.generateOffsetClause(offset, options);
        if (result)
          sqlParts.push(result);
      }
    }

    return sqlParts.join(' ');
  }

  /// Generate the `WHERE`, `ORDER`, `LIMIT`, and `OFFSET` clauses
  /// to apply to the query. If any one of these clauses is
  /// blank, then it will be skipped. If there is no output because
  /// all clauses were skipped, then an empty string will be returned instead.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to pull the conditions, "order by", "limit", and "offset" clauses from.
  ///   options?: object
  ///     Options for the operation. These options are simply passed through to the
  ///     the respective calls that generate the sub-parts of this operation. One
  ///     common option that can be used here for all connections is the `separateWhereAndOrder`
  ///     option. If `true`, then an object with the following shape will be returned:
  ///     `{ where: string; orderLimitOffset: string; }`, splitting the clauses apart and
  ///     returning them separately.
  ///
  /// Return: string
  ///   A combo `WHERE ... ORDER BY ... LIMIT ... OFFSET ...` clause to apply to the query.
  ///   If any one of these sub-parts is empty or invalid, they will be skipped.
  ///   i.e. if there is no `LIMIT` applied to the query, then the `LIMIT` and `OFFSET`
  ///   will be skipped. If there are no conditions for the query, then the `WHERE` clause
  ///   will be skipped. If there is no output because all sub-parts (clauses) were skipped,
  ///   then an empty string will be returned instead.
  generateWhereAndOrderLimitOffset(queryEngine, _options) {
    let options   = _options || {};
    let sqlParts  = [];

    let where = this.generateSelectWhereConditions(queryEngine, options);
    if (where)
      sqlParts.push(`WHERE ${where}`);

    let orderLimitOffset = this.generateSelectOrderLimitOffset(queryEngine, options);
    if (orderLimitOffset)
      sqlParts.push(orderLimitOffset);

    if (options.separateWhereAndOrder)
      return { where, orderLimitOffset };

    return sqlParts.join(' ');
  }

  /// Generate a full `SELECT` statement using the provided
  /// `queryEngine`.
  ///
  /// This will generate a `SELECT` statement for the underlying
  /// database that will include the field projection, table joins,
  /// any `GROUP BY` clause that is applied, all the `WHERE` conditions,
  /// any sub-queries involved, and an `ORDER BY`, `LIMIT`, and `OFFSET`
  /// if those are in-use in the query. This method will be recursively
  /// called for any sub-queries encountered.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to use to generate the `SELECT` statement.
  ///   options?: object
  ///     Options for the operation. These options are passed through all generation calls
  ///     invoked inside this method, and so impact all methods used to generate the statement,
  ///     including methods used for column escaping, literal conversion, etc...
  ///     Though these options are often connection-specific,
  ///     the following options are available across all connections:
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `includeRelations` | `boolean` | `false` | If `true`, then a `.PROJECT('*')` will be applied for you, including all tables used in the operation in the output. |
  ///     | `isSubQuery` | `boolean` | `false` | Though often not used directly by the user, if this option is `true`, then it will alter how the `SELECT` statement is generated... for example, the `ORDER BY` clause might be skipped entirely, or the field projection might be altered. |
  ///     | `returnFieldProjection` | `boolean` | `false` | If `true`, then return an object with the shape `{ sql, projectionFields }`, where `sql` is the `SELECT` statement, and `projectionFields` are the fields that were projected. |
  ///
  /// Return: string
  ///   A fully generated `SELECT` statement that can be used directly in the underlying database
  ///   to query data.
  generateSelectStatement(_queryEngine, _options) {
    let queryEngine = _queryEngine;
    if (!QueryEngine.isQuery(queryEngine))
      throw new Error(`${this.constructor.name}::generateSelectStatement: A query is required as the first argument.`);

    let options = Object.create(_options || {});
    if (options.includeRelations === true)
      queryEngine = queryEngine.clone().PROJECT('*');

    let rootModel = queryEngine.getOperationContext().rootModel;
    if (!rootModel)
      throw new Error(`${this.constructor.name}::generateSelectStatement: No root model found.`);

    let sqlParts = [ 'SELECT' ];
    let projectionFields;

    options.selectStatement = true;

    projectionFields = this.getProjectedFields(queryEngine, options, true);
    sqlParts.push(this.generateSelectQueryFieldProjection(queryEngine, options, projectionFields));

    sqlParts.push(this.generateFromTableOrTableJoin(rootModel, undefined, options));
    sqlParts.push(this.generateSelectQueryJoinTables(queryEngine, options));
    let { where, orderLimitOffset } = this.generateWhereAndOrderLimitOffset(queryEngine, this.stackAssign(options, { projectionFields, separateWhereAndOrder: true }));
    if (where)
      sqlParts.push(`WHERE ${where}`);

    sqlParts.push(this.generateGroupByAndHavingClause(queryEngine, options));

    if (orderLimitOffset)
      sqlParts.push(orderLimitOffset);

    let sql = sqlParts.filter(Boolean).join(' ');

    if (options.returnFieldProjection === true)
      return { sql, projectionFields };
    else
      return sql;
  }

  /// Get the default value for a field.
  ///
  /// This method is used for `CREATE TABLE`, `ALTER TABLE`, `UPDATE`, and `INSERT`
  /// statements. It uses the `defaultValue` of the `field` provided
  /// to fetch any `DEFAULT` that might be applicable to the field
  /// at the database level for a `CREATE TABLE` or `ALTER TABLE` statement. It might
  /// also be used for things like `created_at` and `updated_at` fields during `UPDATE`
  /// or `INSERT` statements.
  ///
  /// Most default values for fields are applied client-side by Mythix ORM
  /// immediately before an `INSERT` or `UPDATE` statement is executed.
  /// However, some of them are set directly at the database level for field
  /// defaults, such as `AUTOINCREMENT`, and some date and times types (i.e. `NOW`).
  /// This method will return a string representing the default value that
  /// should be applied to a column (i.e. `DEFAULT NOW()`), or it will return
  /// a literal defining the default value that might change the entire statement.
  /// For example, `AUTOINCREMENT` in PostgreSQL is actually handled by converting
  /// the data type of the field to a `SERIAL` type.
  ///
  /// This method is also used to fetch the default value for columns during an
  /// `UPDATE` or `INSERT` statement. For example, for `created_at` and `updated_at`
  /// fields, the default might be set during `INSERT` or always set on `UPDATE` operations.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to fetch the `defaultValue` from, if any.
  ///   fieldName: string
  ///     The name of the field the default value is being fetched for. This should always be
  ///     the same as `field.fieldName`.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `escape` | `boolean` | `true` | If `true`, then Mythix ORM will escape the default value found (i.e. with single quotes) so it is treated as a "value" in the underlying database. |
  ///     | `isInsertOperation` | `boolean` | `false` | If `true`, then Mythix ORM is reporting that this is for an `INSERT` operation. |
  ///     | `isUpdateOperation` | `boolean` | `false` | If `true`, then Mythix ORM is reporting that this is for an `UPDATE` operation. |
  ///     | `rawLiterals` | `boolean` | `false` | If `true`, then Mythix ORM will return the literal raw without stringifying it--if the default value is a literal. |
  ///     | `remoteOnly` | `boolean` | `false` | If `true`, then Mythix ORM will only return a default for the field if it is flagged as a "remote" or "literal" default value (i.e. an `AUTOINCREMENT` default would be flagged "remote"). |
  ///     | `useDefaultKeyword` | `boolean` | `true` | If `true`, then Mythix ORM will prefix any default value found with a `DEFAULT` statement (for use in `CREATE TABLE` statements). |
  ///
  /// Return: undefined | string | Literal
  ///   Return a string representing the escaped default value, a Literal if the `rawLiterals` option is `true`,
  ///   or `undefined` if the field has no default value. A default value will not always be returned from this
  ///   method simply because the provided `field` has a `defaultValue` property. Only default values applicable
  ///   at the database level, or applicable to the operation being carried out will be returned.
  getFieldDefaultValue(field, fieldName, _options) {
    let options       = _options || {};
    let defaultValue  = field.defaultValue;
    if (defaultValue === undefined)
      return;

    if (options.isUpdateOperation && !DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'onUpdate' ]))
      return;

    if (options.isInsertOperation && !DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'onInsert' ]))
      return;

    let useDefaultKeyword = (Object.prototype.hasOwnProperty.call(options, 'useDefaultKeyword')) ? options.useDefaultKeyword : true;
    let escapeValue       = (Object.prototype.hasOwnProperty.call(options, 'escape')) ? options.escape : true;

    if (typeof defaultValue === 'function') {
      if (options.remoteOnly !== true) {
        defaultValue = defaultValue({ field, fieldName, connection: this.connection, _static: true });
      } else if (DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'literal', 'remote' ])) {
        defaultValue = defaultValue({ field, fieldName, connection: this.connection, _static: true });
        escapeValue = false;
      } else {
        return;
      }
    }

    if (LiteralBase.isLiteral(defaultValue)) {
      if (defaultValue.options.escape === false)
        escapeValue = false;

      useDefaultKeyword = (defaultValue.options.noDefaultStatementOnCreateTable !== true);

      if (options.isUpdateOperation || options.isInsertOperation)
        useDefaultKeyword = false;

      if (options.rawLiterals !== true)
        defaultValue = defaultValue.toString(this.connection);
      else
        return defaultValue;
    }

    if (escapeValue)
      defaultValue = this.escape(field, defaultValue);

    if (useDefaultKeyword)
      return `DEFAULT ${defaultValue}`;
    else
      return `${defaultValue}`;
  }

  /// Generate an index name for creating an index on
  /// one or more columns.
  ///
  /// This will take one or more field names from the `Model`
  /// provided and generate an index name for creating an index
  /// in the underlying database. This method can generate an index
  /// name for indexing a single column (if a single field name is provided),
  /// or it can generate an index name for indexing multiple columns
  /// as a "combo index".
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model to use for the table to index on. This model should also be
  ///     the model that owns all fields to be indexed. It isn't possible to index
  ///     columns across different tables, so the fields provided must all be from
  ///     this same `Model`.
  ///   indexFieldNames: Array<string>
  ///     The field names that will be used to create the single or combo index. A
  ///     single field name will generate an index name for a single column, whereas
  ///     more than one field name will generate an index name for a combo-index that
  ///     indexes all columns requested. These can be fully qualified field names, but
  ///     they don't have to be, since the owning `Model` is already known. If fully qualified
  ///     field names are used, then the model name for each field must match the `Model`
  ///     provided (making it pointless to use fully qualified field names).
  ///   options?: object
  ///     Options for the operation. These are not used by this method, and instead are
  ///     just provided for the user--should they overload this method and need the options.
  ///
  /// Return: string
  ///   Return an index name, in the format `'idx_tableName_column1_column2_column3_...'`. If
  ///   the `indexFieldNames` provided is empty--or result in an empty set of field names after
  ///   filtering out invalid field names--then an empty string will be returned instead.
  // eslint-disable-next-line no-unused-vars
  generateIndexName(Model, _indexFieldNames, options) {
    let indexFieldNames = Nife.toArray(_indexFieldNames).filter((index) => {
      return (Nife.instanceOf(index, 'string') && Nife.isNotEmpty(index));
    });

    if (indexFieldNames.length === 0)
      return '';

    let tableName   = Model.getTableName(this.connection);
    let columnNames = indexFieldNames.map((fieldName) => {
      let field = Model.getField(fieldName);
      if (!field)
        throw new Error(`${this.constructor.name}::generateIndexName: Unable to find field named "${fieldName}".`);

      return field.columnName;
    });

    return this.escapeID(`idx_${tableName}_${columnNames.sort().join('_')}`);
  }

  /// Generate a `CREATE INDEX` statement.
  ///
  /// This will generate a `CREATE INDEX` statement, indexing
  /// all fields (columns) provided. If a single field name is
  /// provided, then a `CREATE INDEX` statement for a single column
  /// will be generated. If more than one field name is provided, then
  /// a `CREATE INDEX` statement for a combo-index (indexing across more
  /// than one column at once) will be generated instead.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model to use for the table to index on. This model should also be
  ///     the model that owns all fields to be indexed. It isn't possible to index
  ///     columns across different tables, so the fields provided must all be from
  ///     this same `Model`.
  ///   indexFieldNames: Array<string>
  ///     The field names that will be used to create the single or combo index. A
  ///     single field name will generate a statement for a single column, whereas
  ///     more than one field name will generate a statement for a combo-index that
  ///     indexes all columns requested. These can be fully qualified field names, but
  ///     they don't have to be, since the owning `Model` is already known. If fully qualified
  ///     field names are used, then the model name for each field must match the `Model`
  ///     provided (making it pointless to use fully qualified field names).
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `concurrently` | `boolean` | `false` | If `true`, then add a `CONCURRENTLY` clause to the `CREATE INDEX` statement (if the database supports it). |
  ///     | `ifNotExists` | `boolean` | `false` | If `true`, then add an `IF NOT EXISTS` clause to the `CREATE INDEX` statement. |
  ///
  /// Return: string
  ///   Return a fully formatted `CREATE INDEX` statement for the fields (columns)
  ///   requested. An empty string will be returned if `indexFieldNames` is empty,
  ///   or contains no valid field names.
  generateCreateIndexStatement(Model, _indexFieldNames, _options) {
    let indexFieldNames = Nife.toArray(_indexFieldNames).filter((fieldName) => {
      if (Nife.isEmpty(fieldName))
        return false;

      return Nife.instanceOf(fieldName, 'string');
    });

    if (Nife.isEmpty(indexFieldNames))
      return '';

    let options           = _options || {};
    let escapedTableName  = this.getEscapedTableName(Model, options);
    let flags             = [];

    if (options.concurrently)
      flags.push('CONCURRENTLY');

    if (options.ifNotExists)
      flags.push('IF NOT EXISTS');

    flags = flags.join(' ');

    let indexName           = this.generateIndexName(Model, indexFieldNames, options);
    let escapedColumnNames  = indexFieldNames.map((fieldName) => {
      let thisField = Model.getField(fieldName);
      if (!thisField)
        throw new Error(`${this.constructor.name}::generateCreateIndexStatement: Unable to find field named "${fieldName}".`);

      return this.getEscapedColumnName(Model, thisField, { ...options, columnNameOnly: true });
    });

    return `CREATE INDEX${(flags) ? ` ${flags}` : ''} ${indexName} ON ${escapedTableName} (${escapedColumnNames.join(',')})`;
  }

  /// Generate a `DROP INDEX` statement.
  ///
  /// This will generate a `DROP INDEX` statement, using the provided
  /// `indexFieldNames` to generate the name of the index to be dropped.
  /// The provided `indexFieldNames` are passed off to <see>SQLQueryGeneratorBase.generateIndexName</see>
  /// to get the name of the index to drop.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model to use for the table to index on. This model should also be
  ///     the model that owns all fields to be indexed. It isn't possible to index
  ///     columns across different tables, so the fields provided must all be from
  ///     this same `Model`.
  ///   indexFieldNames: Array<string>
  ///     The field names that will be used to create the single or combo index. A
  ///     single field name will generate a statement for a single column, whereas
  ///     more than one field name will generate a statement for a combo-index that
  ///     indexes all columns requested. These can be fully qualified field names, but
  ///     they don't have to be, since the owning `Model` is already known. If fully qualified
  ///     field names are used, then the model name for each field must match the `Model`
  ///     provided (making it pointless to use fully qualified field names).
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `concurrently` | `boolean` | `false` | If `true`, then add a `CONCURRENTLY` clause to the `DROP INDEX` statement (if the database supports it). |
  ///     | `ifExists` | `boolean` | `false` | If `true`, then add an `IF EXISTS` clause to the `DROP INDEX` statement. |
  ///     | `cascade` | `boolean` | `true` | If `true`, then add a `CASCADE` clause to the `DROP INDEX` statement (if the database supports it). |
  ///
  /// Return: string
  ///   Return a fully formatted `DROP INDEX` statement for the fields (columns)
  ///   requested. An empty string will be returned if `indexFieldNames` is empty,
  ///   or contains no valid field names. <see>SQLQueryGeneratorBase.generateIndexName</see> is called
  ///   with the provided `indexFieldNames` to generate the name of the index that should
  ///   be dropped.
  ///
  /// See: SQLQueryGeneratorBase.generateIndexName
  generateDropIndexStatement(Model, _indexFieldNames, _options) {
    let indexFieldNames = Nife.toArray(_indexFieldNames).filter((fieldName) => {
      if (Nife.isEmpty(fieldName))
        return false;

      return Nife.instanceOf(fieldName, 'string');
    });

    if (Nife.isEmpty(indexFieldNames))
      return '';

    let options   = _options || {};
    let flags     = [];
    let postFlags = [];

    if (options.concurrently)
      flags.push('CONCURRENTLY');

    if (options.ifExists)
      flags.push('IF EXISTS');

    if (options.cascade !== false)
      postFlags.push('CASCADE');
    else
      postFlags.push('RESTRICT');

    flags = flags.join(' ');
    postFlags = postFlags.join(' ');

    let indexName = this.generateIndexName(Model, indexFieldNames, options);
    return `DROP INDEX${(flags) ? ` ${flags}` : ''} ${indexName}${(postFlags) ? ` ${postFlags}` : ''}`;
  }

  /// Generate zero or more `CREATE INDEX` statements,
  /// using `field.index` to generate the statements.
  ///
  /// A [Field](https://github.com/th317erd/mythix-orm/wiki/Field) in Mythix ORM
  /// can have an `index` property (see [Field.index](https://github.com/th317erd/mythix-orm/wiki/Field#property-index))
  /// that defines the indexes to be created for the field. A `true` value is short for
  /// "index this field". Other field names in the `index` array mean
  /// "index this field combined with the fields specified, creating a combined index".
  ///
  /// This method will turn the `index` property on the provided `field` into one or more `CREATE INDEX`
  /// statements. If the `index` property on the `field` is falsy, or empty, then an empty array
  /// will be returned instead.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that owns the `field` provided.
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to generate indexes for, using the `index` property of this field.
  ///   options?: object
  ///     Options for the operation. These options are passed off to <see>SQLQueryGeneratorBase.generateCreateIndexStatement</see>
  ///     to generate each `CREATE INDEX` statement.
  ///
  /// Return: Array<string>
  ///   Return an array of `CREATE INDEX` statements. If the `index` property on the provided
  ///   `field` is falsy or empty, then an empty array will be returned instead.
  generateColumnIndexes(Model, field, _options) {
    let indexes = Nife.toArray(field.index).filter((index) => {
      if (index === true)
        return true;

      return (Nife.instanceOf(index, 'string', 'array') && Nife.isNotEmpty(index));
    });

    if (indexes.length === 0)
      return [];

    let options = _options || {};
    return indexes.map((indexNames) => {
      let fieldIndexNames = [ field.fieldName ];
      if (indexNames !== true)
        fieldIndexNames = fieldIndexNames.concat(indexNames);

      return this.generateCreateIndexStatement(Model, fieldIndexNames, options);
    });
  }

  /// Generate a `DROP TABLE` statement.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table to be dropped.
  ///   options?: object
  ///     Options for the operation.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `ifExists` | `boolean` | `false` | If `true`, then add an `IF EXISTS` clause to the `DROP TABLE` statement. |
  ///
  /// Return: string
  ///   Return a fully formatted `DROP TABLE` statement, using the `Model` provided
  ///   to define which table should be dropped.
  generateDropTableStatement(Model, _options) {
    let options           = _options || {};
    let escapedTableName  = this.getEscapedTableName(Model, options);
    let flags             = [];

    if (options.ifExists)
      flags.push('IF EXISTS');

    flags = flags.join(' ');

    return `DROP TABLE ${flags} ${escapedTableName}${(options.cascade !== false) ? ' CASCADE' : ''}`;
  }

  /// Generate foreign key constraints for a column
  /// in a `CREATE TABLE` statement.
  ///
  /// This method will generate database specific syntax
  /// for foreign key constraints to apply to a column
  /// in a `CREATE TABLE` statement.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to generate foreign key constraints for. This field should
  ///     have a [ForeignKeyType](https://github.com/th317erd/mythix-orm/wiki/ForeignKeyType)
  ///     `type`.
  ///   type: [ForeignKeyType](https://github.com/th317erd/mythix-orm/wiki/ForeignKeyType)
  ///     The `type` of the `field` provided, which should always be a [ForeignKeyType](https://github.com/th317erd/mythix-orm/wiki/ForeignKeyType).
  ///   options?: object
  ///     Options for the operation. These options are simply passed through to any
  ///     <see>SQLQueryGeneratorBase.getEscapedColumnName</see>, or <see>SQLQueryGeneratorBase.getEscapedTableName</see>
  ///     calls that are made internally by this method.
  ///
  /// Return: string
  ///   A database specific string for defining foreign key constraints for a column.
  ///   Any `ON DELETE` or `ON UPDATE` clauses will be generated from the `onDelete`
  ///   and `onUpdate` properties set on the [ForeignKeyType](https://github.com/th317erd/mythix-orm/wiki/ForeignKeyType)
  ///   `type` for the field.
  generateForeignKeyConstraint(field, type, options) {
    let typeOptions = type.getOptions();
    let targetModel = type.getTargetModel(this.connection);
    let targetField = type.getTargetField(this.connection);

    let sqlParts = [
      'FOREIGN KEY(',
      this.getEscapedColumnName(field.Model, field, { ...(options || {}), columnNameOnly: true }),
      ') REFERENCES ',
      this.getEscapedTableName(targetModel, options),
      '(',
      this.getEscapedColumnName(targetModel, targetField, { ...(options || {}), columnNameOnly: true }),
      ')',
    ];

    if (typeOptions.deferred === true) {
      sqlParts.push(' ');
      sqlParts.push('DEFERRABLE INITIALLY DEFERRED');
    }

    if (typeOptions.onDelete) {
      sqlParts.push(' ');
      sqlParts.push(`ON DELETE ${typeOptions.onDelete.toUpperCase()}`);
    }

    if (typeOptions.onUpdate) {
      sqlParts.push(' ');
      sqlParts.push(`ON UPDATE ${typeOptions.onUpdate.toUpperCase()}`);
    }

    return sqlParts.join('');
  }

  /// Generate an "inner tail" for a `CREATE TABLE`
  /// statement.
  ///
  /// An "inner tail" is the trailing part of the `CREATE TABLE`
  /// statement that is still inside the parenthesis of the statement,
  /// after any columns have been defined. For example:
  /// ```sql
  /// CREATE TABLE table_name (
  ///   column1 datatype(length) column_contraint,
  ///   column2 datatype(length) column_contraint,
  ///   ... // <---- this is the "inner tail"
  /// );
  ///
  /// ... // <---- this is the "outer tail"
  /// ```
  ///
  /// This is often database specific, and by default will be
  /// used to generate any foreign key constraints used by columns
  /// in the table.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table being created.
  ///   options?: object
  ///     Any options for the `CREATE TABLE` operation being carried out.
  ///
  /// Return: Array<string>
  ///   Return an "inner tail" for the `CREATE TABLE` statement, or an empty
  ///   array if there should be no "inner tail". An array of SQL statements
  ///   is returned by this method, which will be added to the `CREATE TABLE`
  ///   statement (inside its parenthesis).
  ///
  /// See: SQLQueryGeneratorBase.generateForeignKeyConstraint
  // eslint-disable-next-line no-unused-vars
  generateCreateTableStatementInnerTail(Model, options) {
    let fieldParts = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      if (field.type.isForeignKey()) {
        let result = this.generateForeignKeyConstraint(field, field.type);
        if (result)
          fieldParts.push(result);

        return;
      }
    });

    return fieldParts;
  }

  /// Generate an "outer tail" for a `CREATE TABLE`
  /// statement.
  ///
  /// An "outer tail" is the trailing part of the `CREATE TABLE`
  /// statement that is outside the parenthesis of the statement,
  /// after the column list. For example:
  /// ```sql
  /// CREATE TABLE table_name (
  ///   column1 datatype(length) column_contraint,
  ///   column2 datatype(length) column_contraint,
  ///   ... // <---- this is the "inner tail"
  /// );
  ///
  /// ... // <---- this is the "outer tail"
  /// ```
  ///
  /// This is often database specific, and by default will be
  /// used to generate any `CREATE INDEX` statements for columns
  /// that have indexes.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table being created.
  ///   options?: object
  ///     Any options for the `CREATE TABLE` operation being carried out.
  ///
  /// Return: Array<string>
  ///   Return an "outer tail" for the `CREATE TABLE` statement, or an empty
  ///   array if there should be no "outer tail". An array of SQL statements
  ///   is returned by this method, which will either be added to the `CREATE TABLE`
  ///   statement, or executed separately after the `CREATE TABLE` statement is
  ///   executed--depending on the underlying database.
  ///
  /// See: SQLQueryGeneratorBase.generateColumnIndexes
  // eslint-disable-next-line no-unused-vars
  generateCreateTableStatementOuterTail(Model, options) {
    let fieldParts = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      if (field.type.isForeignKey())
        return;

      if (!field.index)
        return;

      let result = this.generateColumnIndexes(Model, field, { ...options, ifNotExists: true });
      fieldParts = fieldParts.concat(result);
    });

    return Nife.uniq(fieldParts);
  }

  /// Generate a column definition for use inside a `CREATE TABLE`
  /// statement, or an `ALTER TABLE` statement. The generated
  /// column definition will include any `DEFAULT` defined, as well
  /// as any constraints that should be applied to the column, and
  /// will define at least the column's name and type.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table the column definition is for.
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field that defines the column whose definition is being generated.
  ///   options?: object
  ///     Options for the operation. These are simply passed off to other generate
  ///     methods that are used internally, such as <see>SQLQueryGeneratorBase.getEscapedColumnName</see>,
  ///     and [Type.toConnectionType](https://github.com/th317erd/mythix-orm/wiki/Type#method-toConnectionType)
  ///     for stringifying the column's type. There may be connection-specific options that
  ///     can be supplied as well.
  ///
  /// Return: string
  ///   A fully formatted "column definition" statement, for use in
  ///   a `CREATE TABLE` or `ALTER TABLE` statement. i.e. `"id" BIGINT PRIMARY KEY AUTOINCREMENT`.
  generateColumnDeclarationStatement(Model, field, _options) {
    let options         = _options || {};
    let constraintParts = [];
    let defaultValue    = this.getFieldDefaultValue(field, field.fieldName, { remoteOnly: true });

    if (field.primaryKey) {
      if (LiteralBase.isLiteral(field.primaryKey))
        constraintParts.push(field.primaryKey.toString(this.connection));
      else
        constraintParts.push('PRIMARY KEY');

      if (defaultValue !== 'AUTOINCREMENT')
        constraintParts.push('NOT NULL');
    } else {
      if (field.unique) {
        if (LiteralBase.isLiteral(field.unique))
          constraintParts.push(field.unique.toString(this.connection));
        else
          constraintParts.push('UNIQUE');
      }

      if (field.allowNull === false)
        constraintParts.push('NOT NULL');
    }

    if (defaultValue != null && defaultValue !== '' && !(defaultValue === 'AUTOINCREMENT' && options.noAutoIncrementDefault === true))
      constraintParts.push(defaultValue);

    constraintParts = constraintParts.join(' ');
    if (Nife.isNotEmpty(constraintParts))
      constraintParts = ` ${constraintParts}`;

    return `${this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true })} ${field.type.toConnectionType(this.connection, { ...options, createTable: true, defaultValue })}${constraintParts}`;
  }

  /// Generate a full `CREATE TABLE` statement using
  /// the provided `Model` and its fields.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table being created.
  ///   options?: object
  ///     Options for the operation. Though these might contain connection-specific
  ///     options, the following options are common across all connections:
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `ifNotExists` | `boolean` | `false` | If `true`, then add an `IF NOT EXISTS` clause to the `CREATE TABLE` statement. |
  ///
  /// Return: string
  ///   Return a fully formatted `CREATE TABLE` statement, to create
  ///   the table defined by the provided `Model`.
  ///
  /// See: SQLQueryGeneratorBase.generateColumnDeclarationStatement
  ///
  /// See: SQLQueryGeneratorBase.generateCreateTableStatementInnerTail
  generateCreateTableStatement(Model, _options) {
    let options = _options || {};
    let fieldParts = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      fieldParts.push(`  ${this.generateColumnDeclarationStatement(Model, field, options)}`);
    });

    let ifNotExists = '';
    if (options.ifNotExists === true)
      ifNotExists = 'IF NOT EXISTS ';

    let trailingParts = Nife.toArray(this.generateCreateTableStatementInnerTail(Model, options)).filter(Boolean);
    if (Nife.isNotEmpty(trailingParts))
      fieldParts = fieldParts.concat(trailingParts.map((part) => `  ${part.trim()}`));

    let finalStatement = `CREATE TABLE ${ifNotExists}${this.getEscapedTableName(Model)} (\n${fieldParts.join(',\n')}\n)`;
    return finalStatement;
  }

  /// Generate a comma-separated list of values for
  /// use in an `INSERT` statement.
  ///
  /// Only "dirty" fields are inserted into the table, which might seem
  /// odd at first. However, Mythix ORM model instances have all (or most) their
  /// fields set to dirty when they are first instantiated, except fields
  /// such as auto-incrementing ids. This makes sense, because we would want
  /// to insert all columns for a given model instance, but not columns such
  /// as an auto-incrementing "id" that we would want the database to provide
  /// a value for. Any field on a model that should be inserted should already
  /// be marked "dirty", and any field that isn't dirty should instead be provided
  /// the "default value" that is already defined for the column.
  ///
  /// The `dirtyFields` option that can be provided is to provide the fields that
  /// are marked as dirty across **all** model instances being inserted (for bulk-inserts).
  /// If provide, this option will override the "dirty" fields reported by each model
  /// instance, since the values for insertion must be aligned across all rows.
  ///
  /// Arguments:
  ///   model: [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model instance to pull field values from. Only "dirty" values
  ///     will be pulled from the model and compiled into output.
  ///   options?: object
  ///     Options for the operation. Though these might contain connection-specific
  ///     options, the following options are common across all connections:
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `dirtyFields` | `Array<Field>` | `undefined` | If more than one row is being inserted, then define all columns being inserted for the operation. |
  ///
  /// Return: undefined | { modelChanges: object; rowValues: string; }
  ///   Return `undefined` if no model instance is provided, or if the model
  ///   instance is marked as "clean" (meaning no insert needs to happen).
  ///   Otherwise, return an object with the shape: `{ modelChanges: object; rowValues: string; }`,
  ///   where `modelChanges` is an object, where each key is a field name, and each value is the
  ///   value that will be inserted into the database. `rowValues` is a string, that is a
  ///   comma-separated list of all values to be inserted for this row.
  generateInsertFieldValuesFromModel(model, _options) {
    if (!model)
      return;

    let options       = _options || {};
    let sqlParts      = [];
    let modelChanges  = {};
    let dirtyFields   = model._getDirtyFields({ insert: true });

    if (dirtyFields && Object.keys(dirtyFields).length === 0)
      return;

    model.iterateFields(
      ({ field, fieldName }) => {
        if (field.type.isVirtual())
          return;

        if (!Object.prototype.hasOwnProperty.call(dirtyFields, fieldName)) {
          sqlParts.push('');
          return;
        }

        let dirtyField  = dirtyFields[fieldName];
        let fieldValue  = dirtyField.current;

        if (fieldValue === undefined)
          fieldValue = null;

        modelChanges[fieldName] = fieldValue;

        if (LiteralBase.isLiteral(fieldValue))
          fieldValue = fieldValue.toString(this.connection);
        else
          fieldValue = this.escape(field, fieldValue);

        sqlParts.push(fieldValue);
      },
      /* We need dirty fields for all models so the columns align */
      options.dirtyFields || model.getDirtyFields(options),
    );

    return { modelChanges, rowValues: sqlParts.join(',') };
  }

  /// Generate multiple rows of comma-separated values for
  /// a bulk `INSERT` operation.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class of all `models` being inserted.
  ///   models: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)> | [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     An array of model instances, or a single model instance to generate insertion
  ///     values for. Each model (if dirty) will have a single row created for it in the
  ///     underlying database table defined by the provided `Model`.
  ///   options?: object
  ///     Options for the operation. The only option that is really useful here is the
  ///     `newlines` option. If `false`, then newlines won't be used to separate the rows
  ///     of values. By default, newlines will be used to separate each row of values.
  ///
  /// Return: undefined | { modelChanges: Array<object>; values: string; }
  ///   Return `undefined` if the provided `models` is empty. Otherwise,
  ///   return an object with the shape `{ modelChanges: Array<object>; values: string; }`,
  ///   where `modelChanges` are the fields being inserted for each model (key = field name, value = field value),
  ///   and where `values` is the list of row-values to insert into the table, i.e.
  ///   `(value1,value2,value3),(value1,value2,value3),...`.
  ///
  /// See: SQLQueryGeneratorBase.generateInsertFieldValuesFromModel
  generateInsertValuesFromModels(Model, _models, _options) {
    let options                 = _options || {};
    let preparedModels          = this.connection.prepareAllModelsForOperation(Model, _models, options);
    let { models, dirtyFields } = preparedModels;
    let allModelChanges         = [];

    if (Nife.isEmpty(models))
      return;

    let sqlParts    = [];
    let subOptions  = this.stackAssign(options, { dirtyFields });

    for (let i = 0, il = models.length; i < il; i++) {
      let model = models[i];
      if (!ModelBase.isModel(model))
        model = new Model(model);

      let { rowValues, modelChanges } = this.generateInsertFieldValuesFromModel(model, subOptions);
      allModelChanges.push(modelChanges);

      sqlParts.push(`(${rowValues})`);
    }

    return {
      modelChanges: allModelChanges,
      values:       (options.newlines === false) ? sqlParts.join(',') : sqlParts.join(',\n'),
    };
  }

  /// Generate a "tail" for an `INSERT` statement.
  ///
  /// This method is provided to allow the connection
  /// itself for any given database to "tack on extra" to
  /// an `INSERT` statement. This is commonly used by databases
  /// to add on a `RETURNING` clause to the `INSERT` statement.
  /// However, its primary purpose is just to allow the engine
  /// (or the user via overloading) to add on any "extra" to
  /// an `INSERT` statement.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class of all `models` being inserted.
  ///   models: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)> | [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     An array of model instances, or a single model instance. These are the models
  ///     that are being inserted into the database.
  ///   options: object
  ///     Options for the operation.
  ///   context: object
  ///     Useful information about the insert operation taking place. This is an
  ///     object with the shape: `{ escapedTableName: string; modelChanges: Array<object>; dirtyFields: Array<Field>; }`.
  ///
  /// Return: string
  ///   Any "extra" SQL to add onto the end of the `INSERT` statement.
  ///   Most connection drivers will usually use this for a `RETURNING` clause.
  // eslint-disable-next-line no-unused-vars
  generateInsertStatementTail(Model, models, options, context) {
  }

  /// Generate an `INSERT` statement, for inserting
  /// one or more model instances into the database.
  ///
  /// Note:
  ///   "clean" models will be skipped, and won't result
  ///   in any output.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class of all `models` being inserted.
  ///   models: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)> | [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     An array of model instances, or a single model instance. These are the models
  ///     that are being inserted into the database.
  ///   options: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   If all models are clean, or no model instances are provided,
  ///   then an empty string will be returned. Otherwise, a fully
  ///   formatted `INSERT` statement will be returned.
  generateInsertStatement(Model, _models, _options) {
    let options                 = _options || {};
    let preparedModels          = this.connection.prepareAllModelsForOperation(Model, _models, options);
    let { models, dirtyFields } = preparedModels;
    if (Nife.isEmpty(models) || Nife.isEmpty(dirtyFields))
      return '';

    let subOptions  = this.stackAssign(options, {
      asColumn:       true,
      columnNameOnly: true,
      fields:         dirtyFields,
      dirtyFields,
    });

    let { values, modelChanges } = this.generateInsertValuesFromModels(Model, preparedModels, subOptions);
    if (!values)
      return '';

    let escapedTableName  = this.getEscapedTableName(Model, subOptions);
    let escapedFieldNames = Array.from(Object.values(this.getEscapedModelFields(Model, subOptions)));

    let insertStatementTail = this.generateInsertStatementTail(
      Model,
      models,
      subOptions,
      {
        escapedTableName,
        modelChanges,
        dirtyFields,
      },
    );

    if (insertStatementTail)
      return `INSERT INTO ${escapedTableName} (${escapedFieldNames}) VALUES ${values} ${insertStatementTail}`;

    return `INSERT INTO ${escapedTableName} (${escapedFieldNames}) VALUES ${values}`;
  }

  /// Generate a "tail" for an `UPDATE` statement.
  ///
  /// This method is provided to allow the connection
  /// itself for any given database to "tack on extra" to
  /// an `UPDATE` statement. This is commonly used by databases
  /// to add on a `RETURNING` clause to the `UPDATE` statement.
  /// However, its primary purpose is just to allow the engine
  /// (or the user via overloading) to add on any "extra" to
  /// an `UPDATE` statement.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class of all `models` being updated.
  ///   model: object | [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model instance being updated. Bulk-updates aren't really supported
  ///     well by any SQL database, so Mythix ORM takes the long route and
  ///     updates model instances one-by-one. If `queryEngine` is a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) instance,
  ///     then this should be a raw object listing the attributes (field names and values)
  ///     that should be applied across all matching rows.
  ///   queryEngine: null | [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine used for the update statement--if any. Updates have
  ///     two primary paths: 1) update a single model instance, or 2) update across
  ///     multiple rows at once. For the latter, a query engine will be used to
  ///     select which rows to update. In this case, the `queryEngine` argument
  ///     here will be a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) instance.
  ///     In the case that we are updating a single model instance, then this
  ///     `queryEngine` will be `null`.
  ///   options: object
  ///     Options for the operation.
  ///   context: object
  ///     Useful information about the update operation taking place. This is an
  ///     object with the shape:
  ///     ```javascript
  ///     {
  ///       queryEngine: QueryEngine | null;
  ///       escapedTableName: string;
  ///       modelChanges: Array<object>;
  ///       dirtyFields: Array<Field>;
  ///       where: string | null;
  ///     }
  ///     ```
  ///
  /// Return: string
  ///   Any "extra" SQL to add onto the end of the `UPDATE` statement.
  ///   Most connection drivers will usually use this for a `RETURNING` clause.
  // eslint-disable-next-line no-unused-vars
  generateUpdateStatementTail(Model, model, queryEngine, options, context) {
  }

  /// Generate an `UPDATE` statement.
  ///
  /// Update statements in Mythix ORM generally take one of
  /// two forms: 1) Update a single model instance, or 2) Update
  /// one or more columns across multiple rows at once.
  ///
  /// When updating a single model instance, the provided `model`
  /// argument should the model instance to update, and is expected
  /// to have dirty fields. If on the other hand the `queryEngine`
  /// argument is provided, and is a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) instance,
  /// then the provided `model` argument should be a raw object
  /// of attributes (field names) to update across all matching rows.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class of the model being updated.
  ///   model: object | [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model instance being updated. Bulk-updates aren't really supported
  ///     well by any SQL database, so Mythix ORM takes the long route and
  ///     updates model instances one-by-one. If `queryEngine` is a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) instance,
  ///     then this should be a raw object listing the attributes (field names and values)
  ///     that should be applied across all matching rows.
  ///   queryEngine: null | [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine used for the update statement--if any. Updates have
  ///     two primary paths: 1) update a single model instance, or 2) update across
  ///     multiple rows at once. For the latter, a query engine will be used to
  ///     select which rows to update. In this case, the `queryEngine` argument
  ///     here will be a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) instance.
  ///     In the case that we are updating a single model instance, then this
  ///     `queryEngine` will be `null`.
  ///   options: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   Return a fully formatted `UPDATE` statement, either for
  ///   updating a single model instance, or for updating multiple
  ///   rows at once using the provided attributes.
  generateUpdateStatement(Model, _model, _queryEngine, _options) {
    if (!_model)
      return '';

    let queryEngine = _queryEngine;
    let options     = this.stackAssign(_options, { isUpdateOperation: true });

    if (!QueryEngine.isQuery(queryEngine)) {
      queryEngine = null;
      options = _queryEngine || {};
    }

    let model = _model;
    if (!ModelBase.isModel(model)) {
      let newModel = new Model();
      newModel.clearDirty();
      newModel.setAttributes(model);
      model = newModel;
    }

    let modelChanges    = model._getDirtyFields({ update: true });
    let dirtyFieldNames = Object.keys(modelChanges);
    let dirtyFields     = model.getFields(dirtyFieldNames);
    if (Nife.isEmpty(dirtyFields))
      return '';

    let escapedTableName  = this.getEscapedTableName(Model, options);
    let sqlParts          = [ 'UPDATE ', escapedTableName, ' SET ' ];
    let setParts          = [];
    let tabs              = '';

    if (options.newlines !== false) {
      sqlParts.push('\n');
      tabs = '  ';
    }

    for (let i = 0, il = dirtyFields.length; i < il; i++) {
      let dirtyField        = dirtyFields[i];
      let fieldValue        = modelChanges[dirtyField.fieldName].current;
      let escapedColumnName = this.getEscapedColumnName(dirtyField.Model, dirtyField.columnName, { columnNameOnly: true });
      let escapedValue      = (LiteralBase.isLiteral(fieldValue)) ? fieldValue.toString(this.connection) : this.escape(dirtyField, fieldValue);
      if (!escapedValue)
        continue;

      setParts.push(`${tabs}${escapedColumnName} = ${escapedValue}`);
    }

    if (setParts.length === 0)
      return '';

    sqlParts.push((options.newlines === false) ? setParts.join(',') : setParts.join(',\n'));

    let where;
    if (queryEngine) {
      where = this.generateWhereAndOrderLimitOffset(queryEngine, this.stackAssign(options, { orderClauseOnlyIfLimited: true }));
      if (where) {
        if (options.newlines !== false)
          sqlParts.push('\n');
        else
          sqlParts.push(' ');

        sqlParts.push(where);
      }
    }

    let updateStatementTail = this.generateUpdateStatementTail(
      Model,
      model,
      options,
      {
        queryEngine,
        escapedTableName,
        modelChanges: [ modelChanges ],
        dirtyFields,
        where,
      },
    );

    if (updateStatementTail)
      sqlParts.push(` ${updateStatementTail}`);

    return sqlParts.join('');
  }

  /// Generate a `RETURNING` clause for a `DELETE` statement.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class defining the table that is being deleted from.
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine being used to specify which rows to delete.
  ///   pkField: undefined | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The primary key field of the provided `Model`, if it has one. If the model has
  ///     no primary key field, then this will be `undefined`.
  ///   escapedColumnName: string
  ///     The full column name (usually including the table name) of the column to use for the `RETURNING`
  ///     clause. If the provided `Model` has a primary key field, then this should be that column name
  ///     (though the name might be an alias of that column name, depending on how the `DELETE` statement
  ///     is generated). If the provided `Model` has no primary key field, then this will be `*`.
  ///     This column name might differ from the field's column name, because the `DELETE` statement
  ///     might be constructed such that an alias name is needed for the column name.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   Return a `RETURNING` clause to apply to the end of a `DELETE` statement. If
  ///   `escapedColumnName` is empty, then an empty string will be returned.
  // eslint-disable-next-line no-unused-vars
  generateDeleteStatementReturningClause(Model, queryEngine, pkField, escapedColumnName, options) {
    if (!escapedColumnName)
      return '';

    return `RETURNING ${escapedColumnName}`;
  }

  /// Generate a `DELETE` statement to delete rows from
  /// the table defined by `Model`, either by using a
  /// query provided by the user, or by generating a query
  /// based on the provided model instances. If no query
  /// or model instances are provided, then generate a
  /// `DELETE` statement that will delete every row from
  /// the table, truncating the table.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model class defining the table that is being deleted from.
  ///   modelsOrQueryEngine?: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)> | [Model](https://github.com/th317erd/mythix-orm/wiki/Model) | [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     Model instance(s) to delete, or a query engine specifying which rows to delete.
  ///     If model instances are provided, then their primary key field will be used to
  ///     create a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     used to delete those specific primary keys from the database. If the `Model` provided
  ///     has no primary key field, then an exception will be thrown, as deleting model instances
  ///     this way requires the model have a primary key field. If your model has no primary key
  ///     field, then it is required that the user generate their own query to select which rows
  ///     to delete from the underlying table. Instead of provided model instances, the user
  ///     can provide a raw [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine) instance
  ///     that will be used to select which rows to delete instead. If neither is provided, then
  ///     the entire table will be truncated.
  ///   options?: object
  ///     Options for the operation. These are simply passed through to any sub-calls
  ///     this method makes internally.
  ///
  /// Return: string
  ///   Return a fully formatted `DELETE` statement to delete rows from the
  ///   table defined by the provided `Model`. If no model instances or [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///   are provided, then a simple `DELETE FROM "table_name";` statement will be
  ///   generated, truncating the entire table. If model instances or a [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///   are provided, then a `DELETE` statement in the form of
  ///   `DELETE FROM "table_name" WHERE EXISTS(SELECT ...)` will be returned,
  ///   selecting which rows to delete with the provided query.
  generateDeleteStatement(Model, _modelsOrQueryEngine, _options) {
    let queryEngine = _modelsOrQueryEngine;
    let options     = _options;

    if (queryEngine) {
      if (!QueryEngine.isQuery(queryEngine)) {
        let models = Nife.toArray(queryEngine);
        queryEngine = Utils.buildQueryFromModelsAttributes(Model, models);
        if (!queryEngine)
          throw new Error(`${this.constructor.name}::generateDeleteStatement: Data provided for "${Model.getModelName()}" model is insufficient to complete operation.`);
      } else {
        queryEngine = queryEngine.clone();
      }
    }

    let escapedTableName  = this.getEscapedTableName(Model, options);
    let pkField           = Model.getPrimaryKeyField();

    if (queryEngine && queryEngine.queryHasConditions()) {
      if (queryEngine.queryHasJoins()) {
        if (!pkField)
          throw new Error(`${this.constructor.name}::generateDeleteStatement: Can not delete using table joins on a table with no primary key field.`);

        let escapedTableNameAlias = this.getEscapedTableName(Model, { tableNamePrefix: '_' });
        let escapedFieldAlias     = this.getEscapedColumnName(Model, pkField, { columnNameOnly: true });
        let innerSelect = this.generateSelectStatement(
          queryEngine
            .AND[Model.getModelName(this.connection)][pkField.fieldName]
              .EQ(new Literals.Literal(`${escapedTableNameAlias}.${escapedFieldAlias}`))
            .PROJECT(new Literals.Literal('1'))
            .LIMIT(1)
            .OFFSET(0),
          this.stackAssign(
            options,
            {
              isSubQuery:          true,
              subQueryOperator:    'EXISTS',
              noProjectionAliases: true,
              forceLimit:          4294967295,
            },
          ),
        );

        let returningField  = `${escapedTableNameAlias}.${this.getEscapedColumnName(pkField.Model, pkField, this.stackAssign(options, { columnNameOnly: true }))}`;
        let returningClause = this.generateDeleteStatementReturningClause(Model, queryEngine, pkField, returningField, options);

        return `DELETE FROM ${escapedTableName} AS ${escapedTableNameAlias} WHERE EXISTS (${innerSelect})${(returningClause) ? ` ${returningClause}` : ''}`;
      } else {
        let returningField  = (pkField) ? this.getEscapedColumnName(pkField.Model, pkField, options) : '*';
        let returningClause = this.generateDeleteStatementReturningClause(Model, queryEngine, pkField, returningField, options);

        let {
          where,
          orderLimitOffset,
        } = this.generateWhereAndOrderLimitOffset(queryEngine, { ...options, forceLimit: 4294967295, separateWhereAndOrder: true });

        return `DELETE FROM ${escapedTableName}${(where) ? ` WHERE ${where}` : ''}${(returningClause) ? ` ${returningClause}` : ''}${(orderLimitOffset) ? ` ${orderLimitOffset}` : ''}`;
      }
    } else {
      return `DELETE FROM ${escapedTableName}`;
    }
  }

  /// Iterate all fields of the provided `Model`, and
  /// collect and return all fields that have a `defaultValue`
  /// with the `remote` flag set. The `remote` flag on
  /// the `defaultValue` of a field tells Mythix ORM that the
  /// default value is provided by the database itself. This
  /// would be the case for example for `AUTOINCREMENT` ids,
  /// and for `NOW()` date columns--among others.
  ///
  /// Any field that is marked with a `remote` default (a value
  /// provided by the database itself) should always be part of any
  /// `RETURNING` clause in-play, so this method is used to ensure
  /// all `remote` fields are part of the `RETURNING` clause.
  /// See [Helpers](https://github.com/th317erd/mythix-orm/wiki/Helpers) in
  /// the Mythix ORM documentation for a better explanation of "remote" fields
  /// and flags.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model whose "remote" fields should be collected.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: Array<string>
  ///   Return an array of escaped column names for direct use on
  ///   a `RETURNING` clause. If the provided `Model` has no "remote"
  ///   fields, then an empty array will be returned.
  // eslint-disable-next-line no-unused-vars
  _collectRemoteReturningFields(Model, options) {
    let remoteFieldNames = [];

    Model.iterateFields(({ field }) => {
      if (field.type.isVirtual())
        return;

      if (typeof field.defaultValue !== 'function')
        return;

      if (!DefaultHelpers.checkDefaultValueFlags(field.defaultValue, [ 'remote' ]))
        return;

      remoteFieldNames.push(this.getEscapedColumnName(field.Model, field));
    });

    return remoteFieldNames;
  }

  /// Generate a `RETURNING` clause for `UPDATE`
  /// and `INSERT` statements.
  ///
  /// This will generate a `RETURNING` clause that
  /// will always includes all "remote" fields for the `Model`
  /// provided, will always include the primary key of the
  /// model (if the model has one), and will include all
  /// fields marked as "dirty" across all models being inserted
  /// or updated.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table for the insert or update operation.
  ///   models: Array<[Model](https://github.com/th317erd/mythix-orm/wiki/Model)> | [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     An array of model instances, or a single model instance. These are the models
  ///     that are being inserted or updated.
  ///   options: object
  ///     Options for the operation.
  ///   context: object
  ///     The same `context` that is provided to <see>SQLQueryGeneratorBase.generateInsertStatementTail</see> or
  ///     <see>SQLQueryGeneratorBase.generateUpdateStatementTail</see>, depending on if this is an
  ///     insert or update operation.
  ///
  /// Return: string
  ///   Return a `RETURNING` clause to apply to the end of an `UPDATE`
  ///   or `INSERT` statement. If no fields are found for this clause,
  ///   then an empty string will be returned.
  ///
  /// See: SQLQueryGeneratorBase.generateInsertStatementTail
  ///
  /// See: SQLQueryGeneratorBase.generateUpdateStatementTail
  ///
  /// See: SQLQueryGeneratorBase._collectRemoteReturningFields
  generateReturningClause(Model, models, options, context) {
    let {
      modelChanges,
      dirtyFields,
    } = context;

    let returnFieldsMap = {};

    for (let i = 0, il = dirtyFields.length; i < il; i++) {
      let dirtyField = dirtyFields[i];

      for (let j = 0, jl = modelChanges.length; j < jl; j++) {
        let thisModelChanges  = modelChanges[j];
        let dirtyStatus       = thisModelChanges[dirtyField.fieldName];
        if (!dirtyStatus)
          continue;

        let fieldValue = dirtyStatus.current;
        if (!LiteralBase.isLiteral(fieldValue))
          continue;

        if (!fieldValue.options.remote)
          continue;

        let escapedColumnName = this.getEscapedColumnName(dirtyField.Model, dirtyField, options);
        returnFieldsMap[escapedColumnName] = true;

        break;
      }
    }

    let pkFieldName = Model.getPrimaryKeyFieldName();
    if (pkFieldName)
      returnFieldsMap[pkFieldName] = true;

    // Always return fields marked as "remote"
    let remoteFieldNames = this._collectRemoteReturningFields(Model);
    for (let i = 0, il = remoteFieldNames.length; i < il; i++) {
      let fieldName = remoteFieldNames[i];
      returnFieldsMap[fieldName] = true;
    }

    let returnFields = Object.keys(returnFieldsMap);
    if (!returnFields.length)
      return '';

    return `RETURNING ${returnFields.join(',')}`;
  }

  /// Generate a `TRUNCATE TABLE` statement.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table being truncated.
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: string
  ///   Return a fully formatted `TRUNCATE TABLE` statement.
  // eslint-disable-next-line no-unused-vars
  generateTruncateTableStatement(Model, _options) {
    let escapedTableName = this.escapeID(Model.getTableName(this.connection));
    return `TRUNCATE TABLE ${escapedTableName}`;
  }

  /// Generate an `ALTER TABLE` statement
  /// to rename the table.
  ///
  /// Arguments:
  ///   Model: class [Model](https://github.com/th317erd/mythix-orm/wiki/Model)
  ///     The model that defines the table being altered.
  ///   newModelAttributes: object
  ///     An object that contains a `tableName` key for the new table name
  ///   options?: object
  ///     Options for the operation.
  ///
  /// Return: Array<string>
  ///   An array of `ALTER TABLE` statements to change the table's name. For
  ///   most databases this will probably only be a single statement.
  generateAlterTableStatement(Model, newModelAttributes, options) {
    if (Nife.isEmpty(newModelAttributes))
      return [];

    let statements = [];

    if (Nife.isNotEmpty(newModelAttributes.tableName)) {
      let currentTableName = Model.getTableName();
      if (currentTableName !== newModelAttributes.tableName)
        statements.push(`ALTER TABLE ${this.getEscapedTableName(Model, options)} RENAME TO ${this.escapeID(newModelAttributes.tableName)}`);
    }

    return statements;
  }

  /// Generate an `ALTER TABLE ... DROP COLUMN` statement.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to drop from the database.
  ///   options?:
  ///     Options for the operation. Though these might contain
  ///     database specific options, generic options that should
  ///     work for most databases are:
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `ifExists` | `boolean` | `false` | If `true`, then add an `IF EXISTS` clause to the `ALTER TABLE` statement. |
  ///     | `cascade` | `boolean` | `true` | If `true`, then add a `CASCADE` clause to the `ALTER TABLE` statement. |
  ///
  /// Return: string
  ///   An `ALTER TABLE` statement to drop the column specified
  ///   by the provided `field`.
  generateDropColumnStatement(field, _options) {
    let Model   = field.Model;
    let options = _options || {};

    return `ALTER TABLE ${this.getEscapedTableName(Model, options)} DROP COLUMN${(options.ifExists) ? ' IF EXISTS' : ''} ${this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true })} ${(options.cascade !== false) ? 'CASCADE' : 'RESTRICT'}`;
  }

  /// Generate an `ALTER TABLE ... RENAME COLUMN` statement.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to rename in the database.
  ///   newField: object | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A raw object containing a `columnName` or `fieldName` properties, or a `Field` instance
  ///     containing a `columnName` or `fieldName`. This will be used as the new name
  ///     of the column.
  ///   options?:
  ///     Options for the operation.
  ///
  /// Return: string
  ///   An `ALTER TABLE` statement to rename the column specified
  ///   by the provided `field`.
  generateAlterColumnRenameStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} RENAME COLUMN ${escapedColumnName} TO ${this.escapeID(newField.columnName | newField.fieldName)}`;
  }

  /// Generate an `ALTER TABLE` statement to add or remove
  /// a `NOT NULL` constraint on the specified `field`.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to add or remove the constraint from in the database.
  ///   newField: object | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A raw object containing an `allowNull` property, or a `Field` instance
  ///     containing a `allowNull` property. If `true`, then a `NOT NULL` constraint
  ///     will be added. If `false`, then any `NOT NULL` constraint will be dropped.
  ///   options?:
  ///     Options for the operation.
  ///
  /// Return: string
  ///   An `ALTER TABLE` statement to add or remove the `NOT NULL` constraint
  ///   of the specified `field`.
  generateAlterColumnSetOrDropNullConstraintStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} ALTER COLUMN ${escapedColumnName} ${(newField.allowNull) ? 'DROP' : 'SET'} NOT NULL`;
  }

  /// Generate an `ALTER TABLE` statement to add or remove
  /// a `DEFAULT` value for the specified `field`.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to add or remove the `DEFAULT` value from in the database.
  ///   newField: object | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A raw object or a `Field` instance defining how the field is being altered.
  ///     This argument is not used by this method, but is passed through when calling
  ///     other alter table generators.
  ///   newDefaultValue: any
  ///     The new `DEFAULT` value to apply to the column. If this argument is `undefined`,
  ///     then any `DEFAULT` value applied to the column will be dropped. This value must
  ///     already be escaped and ready for the underlying database to consume.
  ///   options?:
  ///     Options for the operation.
  ///
  /// Return: string
  ///   An `ALTER TABLE ... ALTER COLUMN ... DROP | SET DEFAULT` statement to add or set
  ///   a `DEFAULT` value for this column.
  generateAlterColumnSetDefaultStatement(field, newField, newDefaultValue, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    if (newDefaultValue === undefined)
      return `${prefix} ALTER COLUMN ${escapedColumnName} DROP DEFAULT`;
    else
      return `${prefix} ALTER COLUMN ${escapedColumnName} SET DEFAULT ${newDefaultValue}`;
  }

  /// Generate an `ALTER TABLE` statement to change the
  /// type of the `field` specified.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to change the type on in the database.
  ///   newField: object | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A raw object or a `Field` instance defining how the field is being altered.
  ///     This argument is not used by this method, but is passed through when calling
  ///     other alter table generators.
  ///   newFieldType: string
  ///     The new type to change the field/column to. This must be a raw type that
  ///     the underlying database supports, in database format.
  ///   options?:
  ///     Options for the operation.
  ///
  /// Return: string
  ///   An `ALTER TABLE ... ALTER COLUMN ... SET DATA TYPE` statement to alter
  ///   the column's data type.
  generateAlterColumnChangeTypeStatement(field, newField, newFieldType, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} ALTER COLUMN ${escapedColumnName} SET DATA TYPE ${newFieldType}`;
  }

  /// Generate an `ALTER TABLE` statement to add or remove
  /// a `PRIMARY KEY` constraint on the specified `field`.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to add or remove the constraint from in the database.
  ///   newField: object | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A raw object containing an `primaryKey` property, or a `Field` instance
  ///     containing a `primaryKey` property. If `true`, then a `PRIMARY KEY` constraint
  ///     will be added. If `false`, then any `PRIMARY KEY` constraint will be dropped.
  ///   options?:
  ///     Options for the operation.
  ///
  /// Return: string
  ///   An `ALTER TABLE` statement to add or remove the `PRIMARY KEY` constraint
  ///   of the specified `field`.
  generateAlterColumnChangePrimaryKeyConstraintStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    if (newField.primaryKey)
      return `${prefix} ALTER COLUMN ${escapedColumnName} ADD CONSTRAINT PRIMARY KEY`;
    else
      return `${prefix} ALTER COLUMN ${escapedColumnName} DROP CONSTRAINT PRIMARY KEY`;
  }

  /// Generate an `ALTER TABLE` statement to add or remove
  /// a `UNIQUE` constraint on the specified `field`.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to add or remove the constraint from in the database.
  ///   newField: object | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A raw object containing an `unique` property, or a `Field` instance
  ///     containing a `unique` property. If `true`, then a `UNIQUE` constraint
  ///     will be added. If `false`, then any `UNIQUE` constraint will be dropped.
  ///   options?:
  ///     Options for the operation.
  ///
  /// Return: string
  ///   An `ALTER TABLE` statement to add or remove a `UNIQUE` constraint
  ///   of the specified `field`.
  generateAlterColumnChangeUniqueConstraintStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    if (newField.unique)
      return `${prefix} ALTER COLUMN ${escapedColumnName} ADD CONSTRAINT UNIQUE`;
    else
      return `${prefix} ALTER COLUMN ${escapedColumnName} DROP CONSTRAINT UNIQUE`;
  }

  /// Generate multiple `ALTER TABLE` statements to change the
  /// `field` provided to match the `newFieldAttributes` provided.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to alter in the database.
  ///   newFieldAttributes: object | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     A raw object containing field properties, or a `Field` instance. Any differing
  ///     properties between these two "fields" will generate an `ALTER TABLE` statement
  ///     for that difference. For example, if the `columnName` between both "fields" is
  ///     different, then an `ALTER TABLE` statement will be generated to change the column's
  ///     name. Properties that are checked for differences are: `primaryKey`, `unique`, `index`,
  ///     `columnName` & `fieldName`, `allowNull`, `type`, and `defaultValue`. If any of these
  ///     differ between the two provided "fields", then an `ALTER TABLE` statement will be generated
  ///     to update the column to match the new properties of `newFieldAttributes`.
  ///   options?:
  ///     Options for the operation.
  ///
  /// Return: Array<string>
  ///   Multiple `ALTER TABLE` statements to alter the specified `field`
  ///   to match the new properties defined by `newFieldAttributes`. If
  ///   no changes are detected, then an empty array will be returned instead.
  generateAlterColumnStatements(field, _newFieldAttributes, _options) {
    if (Nife.isEmpty(_newFieldAttributes))
      return [];

    const generateIndexFieldNames = (field) => {
      let indexes = Nife.toArray(field.index).filter((index) => {
        if (index === true)
          return true;

        return (Nife.instanceOf(index, 'string', 'array') && Nife.isNotEmpty(index));
      });

      if (indexes.length === 0)
        return {};

      let indexMap = {};

      for (let i = 0, il = indexes.length; i < il; i++) {
        let indexFieldName  = indexes[i];
        let fieldNames      = [ field.fieldName ];

        if (indexFieldName !== true)
          fieldNames = fieldNames.concat(indexFieldName);

        let indexName = this.generateIndexName(Model, fieldNames, options);
        indexMap[indexName] = fieldNames;
      }

      return indexMap;
    };

    const calculateIndexDifferences = () => {
      let currentColumnIndexes  = generateIndexFieldNames(field);
      let currentIndexNames     = Object.keys(currentColumnIndexes);
      let newColumnIndexes      = generateIndexFieldNames(newField);
      let newIndexNames         = Object.keys(newColumnIndexes);

      let dropIndexes = Nife.arraySubtract(currentIndexNames, newIndexNames);
      let addIndexes  = Nife.arraySubtract(newIndexNames, currentIndexNames);

      if (addIndexes.length) {
        for (let i = 0, il = addIndexes.length; i < il; i++) {
          let indexName       = addIndexes[i];
          let indexFieldNames = newColumnIndexes[indexName];

          statements.push(this.generateCreateIndexStatement(Model, indexFieldNames, options));
        }
      }

      if (dropIndexes.length) {
        for (let i = 0, il = dropIndexes.length; i < il; i++) {
          let indexName       = dropIndexes[i];
          let indexFieldNames = currentColumnIndexes[indexName];

          statements.push(this.generateDropIndexStatement(Model, indexFieldNames, options));
        }
      }
    };

    let newField = (Field.isField(_newFieldAttributes)) ? _newFieldAttributes : new Field({ ...field, ..._newFieldAttributes });
    newField.setModel(field.Model);

    let Model       = field.Model;
    let options     = _options || {};
    let statements  = [];

    if (newField.allowNull !== field.allowNull)
      statements.push(this.generateAlterColumnSetOrDropNullConstraintStatement(field, newField, options));

    let currentDefaultValue  = this.getFieldDefaultValue(field, field.fieldName, { useDefaultKeyword: false, escape: true, remoteOnly: true });
    let newDefaultValue      = this.getFieldDefaultValue(newField, newField.fieldName, { useDefaultKeyword: false, escape: true, remoteOnly: true });

    let currentFieldType  = field.type.toConnectionType(this.connection, { createTable: true, defaultValue: currentDefaultValue });
    let newFieldType      = field.type.toConnectionType(this.connection, { createTable: true, defaultValue: newDefaultValue });
    if (newFieldType !== currentFieldType)
      statements.push(this.generateAlterColumnChangeTypeStatement(field, newField, newFieldType, _options));

    if (newDefaultValue !== currentDefaultValue)
      statements.push(this.generateAlterColumnSetDefaultStatement(field, newField, newDefaultValue, options));

    if (newField.primaryKey !== field.primaryKey)
      statements.push(this.generateAlterColumnChangePrimaryKeyConstraintStatement(field, newField, options));

    if (newField.unique !== field.unique)
      statements.push(this.generateAlterColumnChangeUniqueConstraintStatement(field, newField, options));

    if (field.index !== newField.index)
      calculateIndexDifferences();

    if (newField.columnName !== field.columnName)
      statements.push(this.generateAlterColumnRenameStatement(field, newField, options));

    return statements.filter(Boolean);
  }

  /// Generate an `ALTER TABLE ... ADD COLUMN` statement.
  ///
  /// Arguments:
  ///   field: [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///     The field to add to the database.
  ///   options?:
  ///     Options for the operation. Though these might contain
  ///     database specific options, generic options that should
  ///     work for most databases are:
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `ifNotExists` | `boolean` | `false` | If `true`, then add an `IF NOT EXISTS` clause to the `ALTER TABLE` statement. |
  ///
  /// Return: string
  ///   An `ALTER TABLE ... ADD COLUMN` statement to add the column specified
  ///   by the provided `field`.
  generateAddColumnStatement(field, _options) {
    let Model   = field.Model;
    let options = _options || {};
    let prefix  = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;

    return `${prefix} ADD COLUMN${(options.ifNotExists) ? ' IF NOT EXISTS' : ''} ${this.generateColumnDeclarationStatement(Model, field, options)}`;
  }

  /// Convert the provided `queryEngine` into
  /// a `SELECT` statement.
  ///
  /// This is similar to a `toSQL` method in other ORMs.
  /// It is usually called directly from the `queryEngine` itself,
  /// i.e. `queryEngine.toString()` will call this method.
  ///
  /// Arguments:
  ///   queryEngine: [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  ///     The query engine to use to generate a `SELECT` statement.
  ///   options?: object
  ///     Options for the operation. These are simply passed off to <see>SQLQueryGeneratorBase.generateSelectStatement</see>.
  ///
  /// Return: string
  ///   A fully formatted `SELECT` statement, that was generated from
  ///   the provided `queryEngine`.
  toConnectionString(queryEngine, options) {
    return this.generateSelectStatement(queryEngine, options);
  }
}

module.exports = SQLQueryGeneratorBase;
