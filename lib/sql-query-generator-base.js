'use strict';

const Nife = require('nife');
const {
  Types,
  QueryEngine,
  Utils,
  Literals,
  Model: ModelBase,
  QueryGeneratorBase,
} = require('mythix-orm');

const DefaultHelpers  = Types.DefaultHelpers;
const LiteralBase     = Literals.LiteralBase;

class SQLQueryGeneratorBase extends QueryGeneratorBase {
  prepareArrayValuesForSQL(...args) {
    return this.connection.prepareArrayValuesForSQL(...args);
  }

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

          let tableName = field.Model.getTableName();
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

  isFieldProjection(str) {
    return (/^"[^"]+"."[^"]+"|"\w+:[\w.]+"/i).test(str);
  }

  parseFieldProjectionToFieldMap(selectStatement) {
    let firstPart           = selectStatement.replace(/[\r\n]/g, ' ').split(/\s+FROM\s+"/i)[0].replace(/^SELECT\s+/i, '').trim();
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
      if (!this.isFieldProjection(fieldPart))
        projectionFieldMap.set(fieldPart, fieldPart);
    }

    return this.sortFieldProjectionMap(projectionFieldMap);
  }

  generateSelectQueryFieldProjection(queryEngine, options, asMap) {
    let projectedFields = this.getProjectedFields(queryEngine, options, asMap);

    if (asMap === true)
      return projectedFields;
    else
      return Array.from(projectedFields.values()).join(',');
  }

  // eslint-disable-next-line no-unused-vars
  generateSelectQueryOperatorFromQueryEngineOperator(operator, value, valueIsReference, options) {
    if (operator instanceof LiteralBase)
      return operator.toString(this.connection);

    switch (operator) {
      case 'EQ':
        if (!valueIsReference) {
          if (value === null || value === true || value === false)
            return 'IS';
          else if (Array.isArray(value))
            return 'IN';
        }

        return '=';
      case 'NEQ':
        if (!valueIsReference) {
          if (value === null || value === true || value === false)
            return 'IS NOT';
          else if (Array.isArray(value))
            return 'NOT IN';
        }

        return '!=';
      case 'GT':
        return '>';
      case 'GTE':
        return '>=';
      case 'LT':
        return '<';
      case 'LTE':
        return '<=';
      default:
        throw new Error(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: Unknown operator "${operator}".`);
    }
  }

  generateSelectQueryCondition(queryPart, _value, options) {
    let value     = _value;
    let field     = queryPart.Field;
    let isNot     = queryPart.not;
    let operator  = (isNot) ? queryPart.inverseOperator : queryPart.operator;

    // If the value is an array, then handle the
    // special "IN" case for an array
    if (Array.isArray(value)) {
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

        return `(${subParts.join(' OR ')})`;
      }

      // If no values left in array, then
      // skip condition altogether
      if (Nife.isEmpty(arrayValues))
        return '';

      // Otherwise, fall-through
      value = arrayValues;
    }

    let escapedTableName  = this.escapeID(this.getTableNameFromQueryPart(queryPart));
    let escapedColumnName = this.escapeID(field.columnName);
    let sqlOperator       = this.generateSelectQueryOperatorFromQueryEngineOperator(operator, value, false, options);

    if (QueryEngine.isQuery(value)) {
      if (!this.queryHasConditions(value._getRawQuery()))
        return '';

      return `${escapedTableName}.${escapedColumnName} ${sqlOperator} (${this.generateSelectStatement(value, options)})`;
    }

    return `${escapedTableName}.${escapedColumnName} ${sqlOperator} ${this.escape(field, value)}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateFromTableOrTableJoin(Model, joinType, options) {
    if (!Model)
      throw new Error(`${this.constructor.name}::generateFromTableOrTableJoin: No valid model provided.`);

    let escapedTableName = this.escapeID(Model.getTableName());
    return (joinType) ? `${joinType} ${escapedTableName}` : `FROM ${escapedTableName}`;
  }

  generateSelectJoinOnTableQueryCondition(leftQueryPart, rightQueryPart, leftField, rightField, operator, options) {
    let leftSideEscapedTableName    = this.escapeID(this.getTableNameFromQueryPart(leftQueryPart));
    let leftSideEscapedColumnName   = this.escapeID(leftField.columnName);
    let rightSideEscapedTableName   = this.escapeID(this.getTableNameFromQueryPart(rightQueryPart));
    let rightSideEscapedColumnName  = this.escapeID(rightField.columnName);
    let sqlOperator                 = this.generateSelectQueryOperatorFromQueryEngineOperator(operator, undefined, true, options);

    return `${leftSideEscapedTableName}.${leftSideEscapedColumnName} ${sqlOperator} ${rightSideEscapedTableName}.${rightSideEscapedColumnName}`;
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

  generateSelectQueryJoinTables(queryEngine, options) {
    const addToJoins = (joinInfo) => {
      let items = joins.get(joinInfo.joinModelName);
      if (!items) {
        items = [];
        joins.set(joinInfo.joinModelName, items);
      }

      items.push(joinInfo);
    };

    let query = queryEngine._getRawQuery();
    let joins = new Map();

    for (let i = 0, il = query.length; i < il; i++) {
      let queryPart = query[i];
      if (!(Object.prototype.hasOwnProperty.call(queryPart, 'condition') && queryPart.condition === true))
        continue;

      let operatorValue = queryPart.value;
      if (!QueryEngine.isQuery(operatorValue))
        continue;

      // TODO: Need query engine to be able to specify join type
      let joinType = this.generateSQLJoinTypeFromQueryEngineJoinType(queryPart.joinType, queryPart.joinOuter, options);
      let joinInfo = this.getJoinTableInfoFromQueryContexts(queryPart, operatorValue, joinType, options);

      addToJoins(joinInfo);
    }

    let sqlParts  = [];
    for (let joinInfos of joins.values()) {
      let sqlStr = this.generateJoinOnTableQueryConditions(joinInfos, options);
      sqlParts.push(sqlStr);
    }

    return sqlParts.join(' ');
  }

  generateSelectWhereConditions(queryEngine, options) {
    let query     = queryEngine._getRawQuery();
    let sqlParts  = [];
    let hasValue  = false;
    let lastLogicalOperator;

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

        // We shouldn't be adding any logical operator
        // until we have a left-hand value
        if (sqlParts.length > 0) {
          if (queryOperator === 'OR')
            lastLogicalOperator = 'OR';
          else if (queryOperator === 'AND')
            lastLogicalOperator = 'AND';
        }

        // If we have a value for the logical operator
        // then that means we have a sub-grouping
        if (Object.prototype.hasOwnProperty.call(queryPart, 'value') && QueryEngine.isQuery(queryValue)) {
          result = this.generateSelectWhereConditions(queryValue, options);
          if (result)
            result = `(${result})`;
        }
      }

      if (result) {
        if (lastLogicalOperator) {
          sqlParts.push(lastLogicalOperator);
          lastLogicalOperator = null;
        }

        sqlParts.push(result);
        hasValue = true;
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

  // eslint-disable-next-line no-unused-vars
  generateOrderClause(_orders, _options) {
    if (_orders instanceof LiteralBase)
      return _orders.toString(this.connection);

    let orders  = Nife.toArray(_orders).filter(Boolean);
    if (Nife.isEmpty(orders))
      return '';

    let options       = _options || {};
    let orderByParts  = [];
    for (let i = 0, il = orders.length; i < il; i++) {
      let order = orders[i];

      if (order instanceof LiteralBase) {
        orderByParts.push(order.toString(this.connection));
        continue;
      }

      let escapedTableName  = this.escapeID(order.Model.getTableName());
      let escapedColumnName = this.escapeID(order.Field.columnName);
      let orderStr;

      if (options.reverseOrder !== true)
        orderStr = (order.direction === '-') ? 'DESC' : 'ASC';
      else
        orderStr = (order.direction === '-') ? 'ASC' : 'DESC';

      orderByParts.push(`${escapedTableName}.${escapedColumnName} ${orderStr}`);
    }

    return `ORDER BY ${orderByParts.join(',')}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateLimitClause(limit, options) {
    if (limit instanceof LiteralBase)
      return limit.toString(this.connection);

    return `LIMIT ${limit}`;
  }

  // eslint-disable-next-line no-unused-vars
  generateOffsetClause(offset, options) {
    if (offset instanceof LiteralBase)
      return offset.toString(this.connection);

    return `OFFSET ${offset}`;
  }

  generateSelectOrderLimitOffset(queryEngine, options) {
    let {
      order,
      limit,
      offset,
    } = this.getOrderLimitOffset(queryEngine, options);
    let sqlParts = [];

    if (Nife.isNotEmpty(order)) {
      let result = this.generateOrderClause(order, options);
      if (result)
        sqlParts.push(result);
    }

    if (!Object.is(limit, Infinity) && Nife.isNotEmpty(limit)) {
      let result = this.generateLimitClause(limit, options);
      if (result)
        sqlParts.push(result);
    }

    if (Nife.isNotEmpty(offset)) {
      let result = this.generateOffsetClause(offset, options);
      if (result)
        sqlParts.push(result);
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

    return sqlParts.join(' ');
  }

  generateSelectStatement(_queryEngine, _options) {
    let queryEngine = _queryEngine;
    if (!QueryEngine.isQuery(queryEngine))
      throw new Error(`${this.constructor.name}::generateSelectStatement: A query is required as the first argument.`);

    let options = Object.create(_options || {});
    if (options.includeRelations === true)
      queryEngine = queryEngine.PROJECT('*');

    let rootModel = queryEngine._getRawQueryContext().rootModel;
    if (!rootModel)
      throw new Error(`${this.constructor.name}::generateSelectStatement: No root model found.`);

    let sqlParts = [ 'SELECT' ];
    let projectionFields;

    options.selectStatement = true;

    if (options.returnFieldProjection === true || options.asMap === true) {
      projectionFields = this.generateSelectQueryFieldProjection(queryEngine, options, true);
      sqlParts.push(Array.from(projectionFields.values()).join(','));
    } else {
      sqlParts.push(this.generateSelectQueryFieldProjection(queryEngine, options));
    }

    sqlParts.push(this.generateFromTableOrTableJoin(rootModel, undefined, options));
    sqlParts.push(this.generateSelectQueryJoinTables(queryEngine, options));
    sqlParts.push(this.generateWhereAndOrderLimitOffset(queryEngine, options));

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

    if (defaultValue instanceof LiteralBase) {
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
  generateIndexName(Model, field, index, options) {
    let tableName = Model.getTableName();

    if (index === true)
      return this.escapeID(`idx_${tableName}_${field.columnName}`);

    let fieldNames = [];
    for (let i = 0, il = index.length; i < il; i++) {
      let indexFieldName  = index[i];
      let indexField      = Model.getField(indexFieldName);
      if (!indexField)
        throw new Error(`${this.constructor.name}::generateIndexName: Unable to find field named "${indexFieldName}".`);

      fieldNames.push(indexField.columnName);
    }

    return this.escapeID(`idx_${tableName}_${fieldNames.join('_')}`);
  }

  generateColumnIndex(Model, field, index, options) {
    let escapedTableName  = this.escapeID(Model.getTableName());
    let indexName         = this.generateIndexName(Model, field, index, options);

    if (index === true)
      return `CREATE INDEX ${indexName} ON ${escapedTableName} (${this.escapeID(field.columnName)});`;

    let fieldNames = [];
    for (let i = 0, il = index.length; i < il; i++) {
      let indexFieldName  = index[i];
      let indexField      = Model.getField(indexFieldName);
      if (!indexField)
        throw new Error(`${this.constructor.name}::generateColumnIndex: Unable to find field named "${indexFieldName}".`);

      fieldNames.push(this.escapeID(indexField.columnName));
    }

    return `CREATE INDEX ${indexName} ON ${escapedTableName} (${fieldNames.join(',')});`;
  }

  // eslint-disable-next-line no-unused-vars
  generateCreateTableStatementInnerTail(Model, options) {
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

      let Model   = field.Model;
      let indexes = Nife.toArray(field.index).filter(Boolean);
      for (let i = 0, il = indexes.length; i < il; i++) {
        let index   = indexes[i];
        let result  = this.generateColumnIndex(Model, field, index);
        if (result)
          fieldParts.push(result);
      }
    });

    return fieldParts;
  }

  generateCreateTableStatement(Model, _options) {
    let options = _options || {};
    let fieldParts = [];

    Model.iterateFields(({ field, fieldName }) => {
      if (field.type.isVirtual())
        return;

      let columnName      = field.columnName || fieldName;
      let constraintParts = [];

      if (field.primaryKey) {
        if (field.primaryKey instanceof LiteralBase)
          constraintParts.push(field.primaryKey.toString(this.connection));
        else
          constraintParts.push('PRIMARY KEY');
      } else {
        if (field.unique) {
          if (field.unique instanceof LiteralBase)
            constraintParts.push(field.unique.toString(this.connection));
          else
            constraintParts.push('UNIQUE');
        }

        if (field.allowNull === false)
          constraintParts.push('NOT NULL');
      }

      let defaultValue = this.getFieldDefaultValue(field, fieldName, { remoteOnly: true });
      if (defaultValue !== undefined)
        constraintParts.push(defaultValue);

      constraintParts = constraintParts.join(' ');
      if (Nife.isNotEmpty(constraintParts))
        constraintParts = ` ${constraintParts}`;

      fieldParts.push(`  ${this.escapeID(columnName)} ${field.type.toConnectionType(this.connection, { createTable: true, defaultValue })}${constraintParts}`);
    });

    let ifNotExists = 'IF NOT EXISTS ';
    if (options.ifNotExists === false)
      ifNotExists = '';

    let trailingParts = Nife.toArray(this.generateCreateTableStatementInnerTail(Model, options)).filter(Boolean);
    if (Nife.isNotEmpty(trailingParts))
      fieldParts = fieldParts.concat(trailingParts.map((part) => `  ${part.trim()}`));

    let finalStatement = `CREATE TABLE ${ifNotExists}${this.escapeID(Model.getTableName())} (${fieldParts.join(',\n')}\n);`;
    return finalStatement;
  }

  generateInsertFieldValuesFromModel(model, _options) {
    if (!model)
      return '';

    let options       = _options || {};
    let sqlParts      = [];
    let modelChanges  = {};
    let dirtyFields   = model._getDirtyFields({ insert: true });

    if (dirtyFields && Object.keys(dirtyFields).length === 0)
      return '';

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

        if (fieldValue instanceof LiteralBase)
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
      return '';

    let sqlParts    = [];
    let subOptions  = Object.assign(Object.create(options), { dirtyFields });

    for (let i = 0, il = models.length; i < il; i++) {
      let model = models[i];
      if (!(model instanceof ModelBase))
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

    let subOptions  = Object.assign(Object.create(options), {
      asColumn:       true,
      columnNameOnly: true,
      fields:         dirtyFields,
      dirtyFields,
    });

    let { values, modelChanges } = this.generateInsertValuesFromModels(Model, preparedModels, subOptions);
    if (!values)
      return '';

    let escapedTableName  = this.escapeID(Model.getTableName());
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
    let options     = Object.assign({}, _options || {}, { isUpdateOperation: true });

    if (!QueryEngine.isQuery(queryEngine)) {
      queryEngine = null;
      options = _queryEngine || {};
    }

    let model = _model;
    if (!(model instanceof ModelBase)) {
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

    let escapedTableName  = this.escapeID(Model.getTableName());
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
      let escapedColumnName = this.escapeID(dirtyField.columnName);
      let escapedValue      = (fieldValue instanceof LiteralBase) ? fieldValue.toString(this.connection) : this.escape(dirtyField, fieldValue);
      if (!escapedValue)
        continue;

      setParts.push(`${tabs}${escapedColumnName} = ${escapedValue}`);
    }

    if (setParts.length === 0)
      return '';

    sqlParts.push((options.newlines === false) ? setParts.join(',') : setParts.join(',\n'));

    let where;
    if (queryEngine) {
      where = this.generateWhereAndOrderLimitOffset(queryEngine, options);
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

  generateDeleteStatement(Model, _queryEngine, _options) {
    let queryEngine = _queryEngine;
    let options     = _options;

    if (queryEngine) {
      if (!QueryEngine.isQuery(queryEngine)) {
        let models = Nife.toArray(queryEngine);
        queryEngine = Utils.buildQueryFromModelsAttributes(Model, models);
        if (!queryEngine)
          throw new Error(`${this.constructor.name}::generateDeleteStatement: Data provided for "${Model.getModelName()}" model is insufficient to complete operation.`);
      }
    }

    let escapedTableName = this.escapeID(Model.getTableName());
    if (queryEngine) {
      let pkField = Model.getPrimaryKeyField();
      let where   = this.generateWhereAndOrderLimitOffset(queryEngine, options);

      if (where && pkField) {
        if (pkField)
          queryEngine = queryEngine.PROJECT(`${Model.getModelName()}:${pkField.fieldName}`);

        let innerSelect       = this.generateSelectStatement(queryEngine, Object.assign({}, options || {}, { noProjectionAliases: true }));
        let escapedColumnName = this.getEscapedColumnName(Model, pkField, options);

        return `DELETE FROM ${escapedTableName} WHERE ${escapedColumnName} IN (${innerSelect})`;
      } else {
        return `DELETE FROM ${escapedTableName}${(where) ? ` ${where}` : ''}`;
      }
    } else {
      return `DELETE FROM ${escapedTableName}`;
    }
  }
}

module.exports = SQLQueryGeneratorBase;
