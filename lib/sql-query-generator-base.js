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

  /// Check if the string provided is a field identifier
  /// in database format.
  ///
  /// This is used for parsing field projections. When a
  /// `SELECT` operation takes place, if no field projection
  /// is available, then Mythix ORM will attempt to parse the
  /// field projection directly from the `SELECT` statement itself.
  /// This database specific method is used to match against a
  /// projected field, letting Mythix ORM know that it is a projected
  /// field that can be parsed.
  ///
  /// Arguments:
  ///   value: string
  ///     The value to check. This should be a projected field that has been
  ///     split apart from its `SELECT` statement.
  ///
  /// Return: boolean
  ///   Return `true` if this is a projected field that can be parsed, or `false` otherwise.
  isFieldIdentifier(value) {
    return (/^"[^"]+"."[^"]+"|"\w+:[\w.]+"/i).test(value);
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
  ///   This `Map` should have the same format as is returned by <see>ModelScope.margeFields</see>.
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

  /// Given a database field projection from a `SELECT`
  /// statement, parse the projected field, and attempt
  /// to map it back to Mythix ORM model fields.
  ///
  /// This method is database specific, and should be implemented
  /// by each database. It isn't always possible to parse the projected
  /// fields and map them back to model fields, so it is far better
  /// to always use <see>SQLConnectionBase.select</see> with a
  /// [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  /// so that the field projection can be known.
  ///
  /// Arguments:
  ///   str: string
  ///     A single field in the projection of a `SELECT` statement.
  ///   getRawField: boolean
  ///     If `true`, return the raw [Field](https://github.com/th317erd/mythix-orm/wiki/Field) found from the projected field, if any.
  ///
  /// Return: string | [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///   Return the field found by parsing the projected field. A [Field](https://github.com/th317erd/mythix-orm/wiki/Field)
  ///   instance will be returned if the `getRawField` argument is `true`, otherwise the fully qualified
  ///   name of the field found will be returned. If no field is found, then the `str`
  ///   argument will be returned as provided.
  parseFieldProjection = (str, getRawField) => {
    let modelName;
    let fieldName;
    let projectionField;

    str.replace(/(AS\s+)?"(\w+):([\w.]+)"/i, (m, as, _modelName, _fieldName) => {
      modelName = _modelName;
      fieldName = _fieldName;
    });

    if (!modelName || !fieldName) {
      // Reverse search model and field name
      // based on table and column name
      str.replace(/"([^"]+)"."([^"]+)"/i, (m, _tableName, _columnName) => {
        this.connection.findModelField(({ field, stop }) => {
          if (field.columnName !== _columnName)
            return;

          let tableName = field.Model.getTableName(this.connection);
          if (tableName !== _tableName)
            return;

          if (getRawField) {
            projectionField = field;

            stop();

            return;
          }

          modelName = field.Model.getModelName();
          fieldName = field.fieldName;

          stop();
        });
      });

      if (getRawField && projectionField)
        return projectionField;
    }

    if (getRawField && modelName && fieldName) {
      let field = this.connection.getField(fieldName, modelName);
      if (field)
        return field;
    } else if (!modelName || !fieldName) {
      return str;
    }

    return `${modelName}:${fieldName}`;
  };

  /// Given a database field projection from a `SELECT`
  /// statement, parse all projected fields, and attempt
  /// to map them back to Mythix ORM model fields.
  ///
  /// This method is used as a fallback to attempt to get the
  /// projected fields of a `SELECT` statement when none have been
  /// provided... for example, if the user makes a direct `SELECT`
  /// statement against the database.
  ///
  /// This method is database specific, and should be implemented
  /// by each database. It isn't always possible to parse the projected
  /// fields and map them back to model fields, so it is far better
  /// to always use <see>SQLConnectionBase.select</see> with a
  /// [QueryEngine](https://github.com/th317erd/mythix-orm/wiki/QueryEngine)
  /// so that the field projection can be known.
  ///
  /// Arguments:
  ///   selectStatement: string
  ///     The full select statement to parse the field projection from.
  ///
  /// Return: Map<string, string>
  ///   Return the fields parsed, with the keys being fully qualified field names,
  ///   and the values being the projected field name, or raw unparsed field name
  ///   if parsing failed.
  parseFieldProjectionToFieldMap(selectStatement) {
    let firstPart           = selectStatement.replace(/[\r\n]/g, ' ').split(/\s+FROM\s+/i)[0].replace(/^SELECT\s+/i, '').trim();
    let fieldParts          = firstPart.split(',');
    let projectionFieldMap  = new Map();

    for (let i = 0, il = fieldParts.length; i < il; i++) {
      let fieldPart = fieldParts[i].trim();
      let field     = this.parseFieldProjection(fieldPart, true);

      if (field !== fieldPart)
        projectionFieldMap.set(`${field.Model.getModelName()}:${field.fieldName}`, this.getEscapedProjectionName(field.Model, field));
      else
        projectionFieldMap.set(field, field);

      // If this isn't a field, then add it
      if (!this.isFieldIdentifier(fieldPart))
        projectionFieldMap.set(fieldPart, fieldPart);
    }

    return projectionFieldMap;
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
  ///   asMap: boolean
  ///     If `true`, then return the field projection as a `Map`, instead of as a
  ///     comma-separated list of projected fields.
  ///
  /// Return: string | Map<string, string>
  ///   If `asMap` is `false`, then return a comma-separated list of projected fields. Otherwise,
  ///   return the projected fields as a raw `Map` instead.
  generateSelectQueryFieldProjection(queryEngine, options, asMap) {
    let projectedFields = this.getProjectedFields(queryEngine, options, asMap);

    if (asMap === true) {
      return projectedFields;
    } else {
      let projectedFieldList = Array.from(projectedFields.values()).join(',');

      let distinct = queryEngine.getOperationContext().distinct;
      if (distinct) {
        let result = distinct.toString(this.connection, { isProjection: true });
        return `${result} ${projectedFieldList}`;
      }

      return projectedFieldList;
    }
  }

  // eslint-disable-next-line no-unused-vars
  generateSelectQueryOperatorFromQueryEngineOperator(queryPart, operator, value, valueIsReference, options) {
    if (LiteralBase.isLiteral(operator))
      return operator.toString(this.connection);

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
        return '>';
      case 'GTE':
        return '>=';
      case 'LT':
        return '<';
      case 'LTE':
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

  formatLikeValue({ value }) {
    return value;
  }

  // eslint-disable-next-line no-unused-vars
  generateConditionPostfix(context) {
    return '';
  }

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

  // eslint-disable-next-line no-unused-vars
  generateFromTableOrTableJoin(Model, _joinType, options) {
    if (!Model)
      throw new Error(`${this.constructor.name}::generateFromTableOrTableJoin: No valid model provided.`);

    let escapedTableName = this.getEscapedTableName(Model, options);
    let joinType = _joinType;
    if (joinType && LiteralBase.isLiteral(joinType))
      joinType = joinType.toString(this.connection);

    return (joinType) ? `${joinType} ${escapedTableName}` : `FROM ${escapedTableName}`;
  }

  generateSelectJoinOnTableQueryCondition(leftQueryPart, rightQueryPart, leftField, rightField, operator, options) {
    let leftSideEscapedColumnName   = this.getEscapedColumnName(leftField.Model, leftField, options);
    let rightSideEscapedColumnName  = this.getEscapedColumnName(rightField.Model, rightField, options);
    let sqlOperator                 = this.generateSelectQueryOperatorFromQueryEngineOperator(leftQueryPart, operator, undefined, true, options);

    return `${leftSideEscapedColumnName} ${sqlOperator} ${rightSideEscapedColumnName}`;
  }

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

  // TODO: Needs to take a join type object
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

  generateHavingClause(queryEngine, options) {
    let where = this.generateSelectWhereConditions(queryEngine, options);
    return (where) ? `HAVING (${where})` : '';
  }

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

  // eslint-disable-next-line no-unused-vars
  generateLimitClause(limit, options) {
    if (LiteralBase.isLiteral(limit))
      return limit.toString(this.connection);

    return `LIMIT ${limit}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateOffsetClause(offset, options) {
    if (LiteralBase.isLiteral(offset))
      return offset.toString(this.connection);

    return `OFFSET ${offset}`;
  }

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

    projectionFields = this.generateSelectQueryFieldProjection(queryEngine, options, true);
    sqlParts.push(this.generateSelectQueryFieldProjection(queryEngine, options));

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

  generateDropTableStatement(Model, _options) {
    let options           = _options || {};
    let escapedTableName  = this.getEscapedTableName(Model, options);
    let flags             = [];

    if (options.ifExists)
      flags.push('IF EXISTS');

    flags = flags.join(' ');

    return `DROP TABLE ${flags} ${escapedTableName}${(options.cascade !== false) ? ' CASCADE' : ''}`;
  }

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

  // eslint-disable-next-line no-unused-vars
  generateInsertStatementTail(Model, model, options, context) {
  }

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

  // eslint-disable-next-line no-unused-vars
  generateUpdateStatementTail(Model, model, queryEngine, options, context) {
  }

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

  generateDeleteStatementReturningClause(Model, queryEngine, pkField, escapedColumnName, options) {
    if (!escapedColumnName)
      return '';

    return `RETURNING ${escapedColumnName}`;
  }

  generateDeleteStatement(Model, _queryEngine, _options) {
    let queryEngine = _queryEngine;
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

  _collectRemoteReturningFields(Model) {
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

  _collectReturningFields(Model, model, options, context) {
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

        let escapedColumnName = this.getEscapedColumnName(dirtyField.Model, dirtyField);
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
      return;

    return `RETURNING ${returnFields.join(',')}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateTruncateTableStatement(Model, _options) {
    let escapedTableName = this.escapeID(Model.getTableName(this.connection));
    return `TRUNCATE TABLE ${escapedTableName}`;
  }

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

  generateDropColumnStatement(field, _options) {
    let Model   = field.Model;
    let options = _options || {};

    return `ALTER TABLE ${this.getEscapedTableName(Model, options)} DROP COLUMN${(options.ifExists) ? ' IF EXISTS' : ''} ${this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true })} ${(options.cascade !== false) ? 'CASCADE' : 'RESTRICT'}`;
  }

  generateAlterColumnRenameStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} RENAME COLUMN ${escapedColumnName} TO ${this.escapeID(newField.columnName)}`;
  }

  generateAlterColumnSetOrDropNullConstraintStatement(field, newField, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} ALTER COLUMN ${escapedColumnName} ${(newField.allowNull) ? 'DROP' : 'SET'} NOT NULL`;
  }

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

  generateAlterColumnChangeTypeStatement(field, newField, newFieldType, _options) {
    let Model             = field.Model;
    let options           = _options || {};
    let prefix            = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;
    let escapedColumnName = this.getEscapedColumnName(Model, field, { ...options, columnNameOnly: true });

    return `${prefix} ALTER COLUMN ${escapedColumnName} SET DATA TYPE ${newFieldType}`;
  }

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

  generateAddColumnStatement(field, _options) {
    let Model   = field.Model;
    let options = _options || {};
    let prefix  = `ALTER TABLE ${this.getEscapedTableName(Model, options)}`;

    return `${prefix} ADD COLUMN${(options.ifNotExists) ? ' IF NOT EXISTS' : ''} ${this.generateColumnDeclarationStatement(Model, field, options)}`;
  }

  toConnectionString(queryEngine, options) {
    return this.generateSelectStatement(queryEngine, options);
  }
}

module.exports = SQLQueryGeneratorBase;
