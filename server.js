var express = require('express'),
    bodyParser = require("body-parser"),
    sql = require("mssql"),
    cors = require('cors'),
    fs = require('fs'),
    morgan = require('morgan'),
    path = require('path'),
    rfs = require('rotating-file-stream'),
    app = express(),
    router = express.Router();

var logDirectory = path.join(__dirname, 'log');

// ensure log directory exists
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

// create a rotating write stream
var accessLogStream = rfs('access.log', {
    interval: '1d', // rotate daily
    path: logDirectory
});

var databaseConfig = {
    user: "nodejs",
    password: "nodejs",
    server: "localhost\\SQLEXPRESS",
    database: "SmartApp"
};

var whitelist = ['http://localhost:8080']

var corsOptionsDelegate = function (req, callback) {
    var corsOptions;

    if (whitelist.indexOf(req.header('Origin')) !== -1) {
        corsOptions = { origin: true } // reflect (enable) the requested origin in the CORS response 
    }
    else {
        corsOptions = { origin: false } // disable CORS for this request 
    }

    callback(null, corsOptions) // callback expects two parameters: error and options 
}

function getSQLType(dataType, length) {
    if (dataType === 'varchar')
        return sql.VarChar(length)
    else if (dataType === 'int')
        return sql.Int
    else if (dataType === 'decimal')
        return sql.Decimal(length)
}

var db = new sql.ConnectionPool(databaseConfig);

router.route('/getMasterApplication').get((req, res) => {
    var error, msg = '';

    db.connect(function (err) {
        if (err) {
            console.log('error', err);

            db.close();
            
            return next(err);
        }

        var request = new sql.Request(db)
                            .input('applicationType', sql.Char, "M");
    
        request.query('SELECT * FROM Application WHERE ApplicationType = @applicationType', function (err, recordset) {
            db.close();

            if (err) {
                console.log(err);
                
                return next(err);
            }

            res.header("Access-Control-Allow-Origin", "*");
            
            res.send(recordset);
        });
    });
});

router.route('/getApplications').get((req, res) => {
    var error, msg = '';

    db.connect(function (err) {
        if (err) {
            console.log('error', err);

            db.close();
            
            return next(err);
        }

        var request = new sql.Request(db);
    
        request.query('SELECT * FROM Application', function (err, recordset) {
            db.close();

            if (err) {
                console.log(err);
                
                return next(err);
            }

            res.header("Access-Control-Allow-Origin", "*");
            
            res.send(recordset);
        });
    });
});

router.route('/getMasterData/:tableName/:keyColumn/:textColumn').get((req, res) => {
    var error, msg = '';

    db.connect(function (err) {
        if (err) {
            console.log('error', err);

            db.close();

            return next(err);
        }

        var request = new sql.Request(db);

        var query = 'select [' + req.params.textColumn + '] as text, [' + req.params.keyColumn + '] as value from [' + req.params.tableName + ']';

        request.query(query, function (err, recordset) {
            db.close();

            if (err) {
                console.log(err);
                
                return next(err);
            }

            res.header("Access-Control-Allow-Origin", "*");

            res.send(recordset);
        });
    });
});

router.route('/getColumnData').post(cors(corsOptionsDelegate), (req, res, next) => {
    var error, msg = '';

    var schema = req.body;

    db.connect(function (err) {
        if (err) {
            console.log('error', err);

            db.close();

            return next(err);
        }

        var request = new sql.Request(db);
        
        request.multiple = true
        
        var query = '';
        
        schema.forEach(function (item) {
            if (item.formElement == 'Drop Down') {
                var tempquery = "select " + item.lookupTableText + " as text," + item.lookupTableKey + " as value,'" + item.lookupTable + "' as tableName from " + item.lookupTable
                
                query = query == '' ? tempquery : query + '; ' + tempquery;
            }
        });

        request.query(query, function (err, result) {
            db.close();

            if (err) {
                console.log(err);
                
                return next(err);
            }
            
            var elements = [];
            
            result.recordsets.forEach(function (item) {
                item.forEach(function (element) {
                    elements.push(element);
                });
            });

            schema.forEach(function (item) {
                if (item.formElement == 'Drop Down') {
                    item.lookupTableData = elements.filter((a) => a.tableName == item.lookupTable);
                }
            });

            res.header("Access-Control-Allow-Origin", "*");

            res.json(schema);
        });
    });
});

router.route('/getColumnDataByTable/:tableName').get((req, res, next) => {
    var error, msg = '';

    var schema = req.body;
    
    db.connect(function (err) {
        if (err) {
            console.log('error', err);
            
            db.close();
            
            return next(err);
        }

        var request = new sql.Request(db);

        var query = "SELECT ColumnsMetadata from Application WHERE ApplicationName ='" + req.params.tableName + "'";
        
        request.query(query, function (err, data) {
            db.close();

            if (err) {
                console.log(err);
                
                return next(err);
            }

            var columns = JSON.parse(data.recordset[0].ColumnsMetadata);

            var query = '';
            
            columns.forEach(function (item) {
                if (item.formElement === 'Drop Down') {
                    var tempquery = "SELECT [" + item.lookupTableText + "] as text, [" + item.lookupTableKey + "] as value,'" + item.lookupTable + "' as tableName from [" + item.lookupTable +"]";
                    
                    query = query === '' ? tempquery : query + '; ' + tempquery;
                }
            });

            db.connect(function (err) {
                var multirequest = new sql.Request(db);
                
                multirequest.multiple = true

                multirequest.query(query, function (err, result) {
                    db.close();

                    if (err) {
                        console.log(err);
                        
                        return next(err);
                    }
                    
                    var elements = [];
                    
                    result.recordsets.forEach(function (item) {
                        item.forEach(function (element) {
                            elements.push(element);
                        });
                    });

                    columns.forEach(function (item) {
                        if (item.formElement == 'Drop Down') {
                            item.lookupTableData = elements.filter((a) => a.tableName == item.lookupTable);
                        }
                    });

                    res.header("Access-Control-Allow-Origin", "*");

                    res.json(columns);
                });
            });
        });
    });
});

router.route('/getTableData/:tableName').get((req, res, next) => {
    var error, msg = '';
    
    db.connect(function (err) {
        if (err) {
            console.log('error', err);
            
            db.close();
            
            return next(err);
        }

        var request = new sql.Request(db);

        var query = 'SELECCT * FROM ' + req.params.tableName;

        request.query(query, function (err, data) {
            db.close();

            if (err) {
                console.log(err);
                
                return next(err);
            }

            res.header("Access-Control-Allow-Origin", "*");
            
            res.send(data.recordset);
        });
    });
});

router.route('/getTableDataByColumn/:tableName/:columnName/:columnvalue').get((req, res, next) => {
    var error, msg = '';

    db.connect(function (err) {
        if (err) {
            console.log('error', err);

            db.close();
            
            return next(err);
        }

        var request = new sql.Request(db);

        var query = 'SELECT * FROM ' + req.params.tableName + ' Where ' + req.params.columnName + '=' + req.params.columnvalue;
        
        request.query(query, function (err, recordset) {
            db.close();

            if (err) {
                console.log(err);
                
                return next(err);
            }

            res.header("Access-Control-Allow-Origin", "*");
            
            res.send(recordset);
        });
    });
});

router.route('/getTableData').post(cors(corsOptionsDelegate), (req, res, next) => {
    var error, msg = '';

    var schema = req.body;

    db.connect(function (err) {
        if (err) {
            console.log('error', err);

            sql.close();

            return next(err);
        }

        var request = new sql.Request(db);

        request.multiple = true

        var query = '';

        schema.forEach(function (item) {
            if (item.formElement == 'Drop Down') {
                var tempquery = "select [" + item.lookupTableText + "] as text, [" + item.lookupTableKey + "] as value,'" + item.lookupTable + "' as tableName from [" + item.lookupTable + "]"

                query = query == '' ? tempquery : query + '; ' + tempquery;
            }
        });

        request.query(query, function (err, result) {
            db.close();

            if (err) {
                console.log(err);

                return next(err);
            }

            var elements = [];

            res.header("Access-Control-Allow-Origin", "*");

            res.json(result);
        });
    });
});

router.route('/createApplication').post(cors(corsOptionsDelegate), (req, res, next) => {
    var error, msg = '';

    var tableName = req.body.applicationName;

    var data = req.body.data;

    var schema = req.body.schema;

    var applicationType = req.body.applicationType;

    var authorizationGroup = req.body.authorizationGroup;

    db.connect(function (err) {
        if (err) {
            console.log('error', err);
            
            sql.close();

            return next(err);
        }

        var table = new sql.Table(tableName)
        
        table.create = true
    
        schema.forEach(function (item) {
            var isPrimary = item.isPrimary;
            
            table.columns.add(item.columnName, getSQLType(item.dataType, item.length), { nullable: true, primary: isPrimary })
        });

        table.rows = data;

        var request = new sql.Request(db)

        request.bulk(table, (err, result) => {
            if (err) {
                db.close();
                
                console.log('bulk insert error', err);

                return next(err);
            }

            request1 = new sql.Request(db);
            
            request1.input('applicationName', sql.VarChar, tableName);
            request1.input('applicationType', sql.Char, applicationType);
            request1.input('columnsMetadata', sql.NVarChar, JSON.stringify(schema));
            request1.input('createdBy', sql.Int, authorizationGroup);

            request1.query('INSERT INTO Application (ApplicationName, ApplicationType, ColumnsMetadata, CreatedBy) VALUES (@applicationName, @applicationType, @columnsMetadata, @createdBy)', (err, result) => {
                db.close();
                
                if (err) {
                    console.log('bulk insert error', err);

                    return next(err);
                }
                
                res.header("Access-Control-Allow-Origin", "*");
                
                res.json({ message: 'SQL Server table created!', error: error });
            });
        });
    });
});

app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    
    res.header("Access-Control-Allow-Origin", "*");
    
    res.send({
        message: err.message,
        error: {}
    });
});

app.use(morgan('combined', {stream: accessLogStream}))

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({
    extended: false
}));

router.all('*', cors(corsOptionsDelegate));

app.use('/api', router);

var server = app.listen(4000, function () {
    console.log('Server is running... on Port 4000');
})