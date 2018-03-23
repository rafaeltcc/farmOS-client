import {logFactory} from './logFactory';

export default {
  state: {
    logs: [],
    assets: [],
    areas: [],
    currentLogIndex: 0,
  },

  mutations: {
    addCachedLogs(state, payload) {
      const cachedLogs = payload.map(function(cachedLog) {
        return logFactory({
          ...cachedLog,
          isCachedLocally: true
        })
      });
      state.logs = state.logs.concat(cachedLogs);
    },
    addLogAndMakeCurrent(state, newLog) {
      state.currentLogIndex = state.logs.push(newLog) -1;
    },
    // TODO: accept multiple properties
    updateCurrentLog (state, newProperty) {
      state.logs[state.currentLogIndex][newProperty.key] = newProperty.val
    },
  },

  actions: {

    initializeLog({commit, rootState}, logType) {
      // TODO: The User ID will also be needed to sync with server
      const curDate = new Date(Date.now());
      const timestamp = Math.floor(curDate / 1000).toString();
      const curTimeString = curDate.toLocaleTimeString('en-US');
      const curDateString = curDate.toLocaleDateString('en-US');
      const newLog = logFactory({
        type: logType,
        name: `Observation: ${curDateString} - ${curTimeString}`,
        field_farm_log_owner: rootState.user.name ? rootState.user.name : '',
        timestamp: timestamp,
      });
      commit('addLogAndMakeCurrent', newLog);

      // TODO: Separate this into its own action
      let newRecord = newLog;
      delete newRecord.local_id
      openDatabase()
      .then(function(db) {
        return makeTable(db, logType, newRecord);
      })
      .then(function(tx) {
        return saveRecord(tx, logType, newRecord)
      })
      .then(function(results) {
        // Can we be sure this will always be the CURRENT log?
        commit('updateCurrentLog', { key: 'isCachedLocally', val: true });
        commit('updateCurrentLog', { key: 'local_id', val: results.insertId });

      })

    },

    loadCachedLogs({commit}, logType) {
      openDatabase()
      .then(function(db) {
        return getRecords(db, logType)
      })
      .then(function(result) {
        commit('addCachedLogs', result)
      })
      .catch(function(error) {
        console.error(error);
      })
    },

    updateCurrentLog({commit, dispatch, rootState}, newProperty) {
      commit('updateCurrentLog', newProperty);
      let newLog = logFactory({
        ...rootState.data.logs[rootState.data.currentLogIndex]
      })
      newLog[newProperty.key] = newProperty.val;
      dispatch('updateRecord', newLog);
    },

    updateRecord ({commit}, newLog) {
      const table = newLog.type;
      openDatabase()
      .then(function(db) {
        return getTX(db, table);
      })
      .then(function(tx) {
        saveRecord(tx, table, newLog)
      })
      .then(function(tx, result) {
        // Can we be sure this will always be the CURRENT log?
        commit('updateCurrentLog', { key: 'isCachedLocally', val: true })
      })
    },

  }
}

/*Helper funcitons called by actions.  Many of these helper functions execute SQL queries */
function openDatabase () {
  return new Promise(function(resolve, reject) {
    //Here I am both opening the database and making a new table if necessary.

    console.log('opening database');
    //Check whether a local webSQL database exists.  If a local database does not yet exist, make it!
    const db = window.openDatabase("farmOSLocalDB", "1.0", "farmOS Local Database", 200000);
    // window.openDatabase either opens an existing DB or creates a new one.
    resolve(db);

  })
}

//This function obtains the tx database object.  It assumes the table has already been created.
function getTX(db, table) {
  return new Promise(function(resolve, reject) {
    db.transaction(function (tx) {

      var sql = "CREATE TABLE IF NOT EXISTS " +table +" (id INTEGER PRIMARY KEY AUTOINCREMENT, blankColumn TEXT)";

      tx.executeSql(sql, null, function (_tx, result) {
        console.log('Get TX success. Result: ', result);
        resolve(_tx);
      }, function (_tx, error) {
        console.log('Get TX error: ' + error.message);
        // Reject will return the tx object in case you want to try again.
        reject(_tx);
      });

    }) //end db.transaction
  }) //end promise
} //end getTable


function makeTable(db, table, log) {
  return new Promise(function(resolve, reject) {

    console.log(`making table with name ${table} and the following data tempate: `, log);
    //Creates a table called 'tableName' in the DB if none yet exists
    db.transaction(function (tx) {
      var fieldString = '';
      for (var i in log){
        var suffix = "";
        if (typeof i === "number" ){
          suffix = " INT, "
        } else {
          suffix = " VARCHAR(150), "
        }
        fieldString = fieldString+i+suffix;
      }
      //I need to trim the last two characters to avoid a trailing comma
      fieldString = fieldString.substring(0, fieldString.length - 2);

      //the id field will autoincrement beginning with 1
      var sql = "CREATE TABLE IF NOT EXISTS " +
      table +
      " ( local_id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      fieldString +
      ")";

      tx.executeSql(sql, null, function (_tx, result) {
        console.log('Make table success. Result: ', result);
        resolve(_tx);
      }, function (_tx, error) {
        console.log('Make table error: ' + error.message);
        // Reject will return the tx object in case you want to try again.
        reject(_tx);
      });

    });

  })
};

/*
saveRecord either saves a new record or updates an existing one.
If log contains a property called local_id, the database updates the record with that local_id
If log contains no local_id property, a new record is created!
Params:
tx - the database context
table - string name of the table, AKA logType
log - object following the template for that logType
*/

function saveRecord (tx, table, log) {
  return new Promise((resolve, reject) => {
    console.log('SAVING THE FOLLOWING RECORDS:');
    console.log(log);

    var fieldString = "";
    var queryString = "";
    var values = [];
    for (var i in log){
      fieldString = fieldString+i+", ";
      queryString = queryString+"?, ";
      values.push(log[i]);
    }
    //I need to trim the last two characters of each string to avoid trailing commas
    fieldString = fieldString.substring(0, fieldString.length - 2);
    queryString = queryString.substring(0, queryString.length - 2);


    console.log("add record strings")
    console.log(fieldString);
    console.log(queryString);
    console.log(values);

    //Set SQL based on whether the log contains a local_id fieldString
    var sql;
    sql = "INSERT OR REPLACE INTO " +
    table +
    " ("+fieldString+") " +
    "VALUES ("+queryString+")";
    //}
    //tx.executeSql(sql, [tableRecord.text, tableRecord.plantings, tableRecord.locations, tableRecord.livestock],
    tx.executeSql(sql, values, function (_tx, results) {
      console.log('INSERT success');
      resolve(results);
    }, function (_tx, error) {
      console.log('INSERT error: ' + error.message);
      reject(error.message)
    });

  })
};

function getRecords (db, table) {
  return new Promise(function(resolve, reject) {

    //This is called if the db.transaction obtains data
    function dataHandler(tx, results) {
      resolve([...results.rows]);
    }
    //This is called if the db.transaction fails to obtain data
    function errorHandler(tx, error) {
      console.log("No old logs found in cache.");
      resolve([]);
    }

    db.transaction(function (tx) {
      var sql = `SELECT * FROM ${table}`;

      tx.executeSql(sql, [],
        dataHandler,
        errorHandler
      );
    });
  })
}