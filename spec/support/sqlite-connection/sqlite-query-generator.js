'use strict';

const SQLQueryGeneratorBase = require('../../../lib/sql-query-generator-base');

class SQLiteQueryGenerator extends SQLQueryGeneratorBase {
  // eslint-disable-next-line no-unused-vars
  generateSQLJoinTypeFromQueryEngineJoinType(joinType, outer, options) {
    if (!joinType || joinType === 'inner')
      return 'INNER JOIN';
    else if (joinType === 'left')
      return 'LEFT JOIN';
    else if (joinType === 'cross')
      return 'CROSS JOIN';

    return joinType;
  }

  generateInsertStatementTail(Model, models, options, context) {
    return this.generateReturningClause(Model, models, options, context);
  }

  generateUpdateStatementTail(Model, models, options, context) {
    return this.generateReturningClause(Model, models, options, context);
  }

  generateConditionPostfix({ sqlOperator }) {
    if (sqlOperator === 'LIKE' || sqlOperator === 'NOT LIKE')
      return 'ESCAPE \'\\\'';

    return '';
  }

  generateSelectQueryOperatorFromQueryEngineOperator(queryPart, operator, value, valueIsReference, options) {
    let sqlOperator = super.generateSelectQueryOperatorFromQueryEngineOperator(queryPart, operator, value, valueIsReference, options);

    if ((sqlOperator === 'LIKE' || sqlOperator === 'NOT LIKE') && queryPart.caseSensitive === true)
      throw new Error(`${this.constructor.name}::generateSelectQueryOperatorFromQueryEngineOperator: "{ caseSensitive: true }" is not supported for this connection type for the "${sqlOperator}" operator.`);

    return sqlOperator;
  }

  generateDeleteStatementReturningClause(Model, queryEngine, pkField, escapedColumnName, options) {
    if (!escapedColumnName)
      return '';

    let returningField  = (pkField) ? this.getEscapedColumnName(pkField.Model, pkField, options) : '*';
    return `RETURNING ${returningField}`;
  }
}

module.exports = SQLiteQueryGenerator;
