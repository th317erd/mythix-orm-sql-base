/* eslint-disable no-magic-numbers */

'use strict';

/* global describe, it, expect, beforeAll, afterEach, beforeAll, spyOn, fail */

const {
  createConnection,
  truncateTables,
} = require('./sqlite-connection-helper');

describe('SQLiteConnection', () => {
  let connection;

  beforeAll(async () => {
    try {
      let setup = await createConnection();
      connection = setup.connection;
    } catch (error) {
      console.error('Error in beforeAll: ', error);
    }
  });

  afterEach(async () => {
    await truncateTables(connection);
  });

  describe('exec', () => {
    it('should be able to call exec', async () => {
      let result = await connection.exec('SELECT 1+1');
      expect(result.name).toEqual(':memory:');
    });
  });

  describe('query', () => {
    it('should be able to query the database', async () => {
      let result = await connection.query('SELECT 1+1');
      expect(result.rows).toBeInstanceOf(Array);
      expect(result.rows.length).toEqual(1);
      expect(result.rows[0]).toEqual([ 2 ]);
      expect(result.columns).toBeInstanceOf(Array);
      expect(result.columns.length).toEqual(1);
      expect(result.columns[0]).toEqual('1+1');
    });
  });

  describe('getLockMode', () => {
    it('should be able to get the lock mode when no options are specified', async () => {
      expect(connection.getLockMode()).toEqual({ lock: false, read: false, write: false });
    });

    it('should be able to get the lock mode when a modelName is specified', async () => {
      expect(connection.getLockMode('User')).toEqual({ lock: true, modelName: 'User', read: true, write: true });
    });

    it('should fail when a bad modelName is specified', async () => {
      try {
        connection.getLockMode('User2');
        fail('unreachable');
      } catch (error) {
        expect(error.message).toMatch(/"lock" must be the name of a model/);
      }
    });

    it('should fail when a bad value is provided', async () => {
      try {
        connection.getLockMode(10);
        fail('unreachable');
      } catch (error) {
        expect(error.message).toMatch(/"lock" must be the name of a model/);
      }
    });

    it('should fail when an options object is provided with no "modelName" key', async () => {
      try {
        connection.getLockMode({});
        fail('unreachable');
      } catch (error) {
        expect(error.message).toMatch(/"lock" must be the name of a model/);
      }
    });

    it('should fail when an options object is provided with bad "modelName" key', async () => {
      try {
        connection.getLockMode({ modelName: 'User2' });
        fail('unreachable');
      } catch (error) {
        expect(error.message).toMatch(/"lock" must be the name of a model/);
      }
    });

    it('should succeed when an options object is provided with "modelName" key', async () => {
      expect(connection.getLockMode({ modelName: 'User' })).toEqual({ lock: true, modelName: 'User', read: true, write: true });
    });
  });

  describe('transaction', () => {
    it('should be able to create a transaction', async () => {
      let statements = [];

      const originalQuery = connection.query;

      spyOn(connection, 'query').and.callFake((...args) => {
        statements.push(args);
        return originalQuery.apply(connection, args);
      });

      await connection.transaction(async () => {
        await connection.query('SELECT 1+1');
      });

      expect(statements.length).toEqual(3);
      expect(statements[0][0]).toEqual('BEGIN DEFERRED TRANSACTION');
      expect(statements[1][0]).toEqual('SELECT 1+1');
      expect(statements[2][0]).toEqual('COMMIT');
    });

    it('should be able to have transactions inside transactions', async () => {
      let statements = [];

      const originalQuery = connection.query;

      spyOn(connection, 'query').and.callFake((...args) => {
        statements.push(args);
        return originalQuery.apply(connection, args);
      });

      await connection.transaction(async (connection) => {
        await connection.transaction(async (connection) => {
          await connection.query('SELECT 1+1');
        });
      });

      expect(statements.length).toEqual(5);
      expect(statements[0][0]).toEqual('BEGIN DEFERRED TRANSACTION');
      expect(statements[1][0]).toMatch(/SAVEPOINT SP[A-P]{32}/);
      expect(statements[2][0]).toEqual('SELECT 1+1');
      expect(statements[3][0]).toMatch('RELEASE SAVEPOINT SP[A-P]{32}');
      expect(statements[4][0]).toEqual('COMMIT');
    });

    it('should rollback if an error is thrown', async () => {
      let statements = [];

      const originalQuery = connection.query;

      spyOn(connection, 'query').and.callFake((...args) => {
        statements.push(args);
        return originalQuery.apply(connection, args);
      });

      try {
        await connection.transaction(async () => {
          await connection.query('DERP 1+1');
        });

        fail('unreachable');
      } catch (error) {
        expect(error.message).toEqual('near "DERP": syntax error');
        expect(statements.length).toEqual(3);
        expect(statements[0][0]).toEqual('BEGIN DEFERRED TRANSACTION');
        expect(statements[1][0]).toEqual('DERP 1+1');
        expect(statements[2][0]).toEqual('ROLLBACK');
      }
    });

    it('should rollback if an error is thrown in a sub transaction', async () => {
      let statements = [];

      const originalQuery = connection.query;

      spyOn(connection, 'query').and.callFake((...args) => {
        statements.push(args);
        return originalQuery.apply(connection, args);
      });

      try {
        await connection.transaction(async (connection) => {
          await connection.transaction(async (connection) => {
            await connection.query('DERP 1+1');
          });
        });

        fail('unreachable');
      } catch (error) {
        expect(error.message).toEqual('near "DERP": syntax error');
        expect(statements.length).toEqual(5);
        expect(statements[0][0]).toEqual('BEGIN DEFERRED TRANSACTION');
        expect(statements[1][0]).toMatch(/SAVEPOINT SP[A-P]{32}/);
        expect(statements[2][0]).toEqual('DERP 1+1');
        expect(statements[3][0]).toMatch('ROLLBACK TO SAVEPOINT SP[A-P]{32}');
        expect(statements[4][0]).toEqual('ROLLBACK');
      }
    });
  });
});
