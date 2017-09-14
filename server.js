var express = require('express'),
bodyParser = require("body-parser"),
sql = require("mssql"),
cors = require('cors'),
app = express(),
router = express.Router();

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


// var connection = new sql.ConnectionPool(config);

//  First, Start the "SQL SERVER BROWSER" Service in Windows services (I've configured it to start automatically)
//  Second, allow SQL Server Express to accept remote connections over TCP/IP for port 1433 : http://support.webecs.com/kb/a868/how-do-i-configure-sql-server-express-to-allow-remote-tcp-ip-connections-on-port-1433.aspx

/*
app.get('/getApplications', function (req, res) { 
connection.connect(function (err) {
    if (err) {
        console.log('error', err);
    }
    
    var request = new sql.Request();
    
    // request.query('create table test (test int not null, fname varchar(50))', function (err, recordset) {
    request.query('select * from Application', function (err, recordset) {
        if (err) {
            console.log(err);
        }

        res.send(recordset);
    });
});
});

*/

var db = new sql.ConnectionPool(databaseConfig);
// var db = sql.Connection(databaseConfig);
// .then(function(err){
//     if(err) console.log('error connecting to database', err);
//     else console.log('Database connected...');
// });

router.route('/getMasterApplication').get((req, res) => {
var error, msg = '';

db.connect(function (err) {
    if (err) {
        console.log('error', err);
        db.close();
        res.json({ "error": err });
    }

    var request = new sql.Request(db)
                            .input('applicationType', sql.Char, "M");
    
    request.query('SELECT * FROM Application WHERE ApplicationType = @applicationType', function (err, recordset) {
        db.close();

        if (err) {
            console.log(err);
            
            error = err;
        }

        res.send(recordset);
    });
});

// res.json({ message: 'SQL Server table created! - ' + msg, error: error });
});

function getSQLType(dataType, length) {
if (dataType === 'varchar')
    return sql.VarChar(length)
else if (dataType === 'int')
    return sql.Int
else if (dataType === 'decimal')
    return sql.Decimal(length)
}

router.route('/createApplication').post(cors(corsOptionsDelegate), (req, res) => {
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
    }

    var table = new sql.Table(tableName)
    
    table.create = true
    
    schema.forEach(function (item) {
        var isPrimary = item.isPrimary;
        
        table.columns.add(item.columnName, getSQLType(item.dataType, item.length), { nullable: true, primary: isPrimary })
    });

    table.rows = data;

    console.log(data[0]);

    var request = new sql.Request(db)

    request.bulk(table, (err, result) => {
        if (err) {
            db.close();
            
            console.log('bulk insert error', err);
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
            }
            
            res.header("Access-Control-Allow-Origin", "*");
            
            res.json({ message: 'SQL Server table created!', error: error });
        })
    });
});
});

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({
extended: false
}));

router.all('*', cors(corsOptionsDelegate));

app.use('/api', router);

// app.options('*', cors(corsOptionsDelegate));

var server = app.listen(4000, function () {
console.log('Server is running... on Port 4000');
})