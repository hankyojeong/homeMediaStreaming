// Get the Express Module
var express = require('express');
var http = require('http');
var path = require('path');
var url = require('url');

// Get the Express MiddleWare
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var static = require('serve-static');
var errorHandler = require('errorhandler');

// Get the Error Handler Module
var expressErrorHandler = require('express-error-handler');

// Get the Session MiddleWare
var expressSession = require('express-session');

// Get the File upload MiddleWare
var multer = require('multer');
var fs = require('fs');

// Support for multi-server connections(CORS) when clients request ajax
var cors = require('cors');

// Use MongoDB Module
var MongoClient = require('mongodb').MongoClient;

// Use Log File
var winston = require('winston');   // Process of LOG
var winstonDaily = require('winston-daily-rotate-file');    // Process of Daily LOG
var moment = require('moment');     // Process of Time

function timeStampFormat() {
    return moment().format('YYYY-MM-DD HH:mm:ss.SSS ZZ');
}

var logger = winston.createLogger({
    transports: [
        new (winstonDaily)({
            name: 'info-file',
            filename: './log/server',
            datePattern: '_yyyy-MM-dd.log',
            colorize: false,
            maxSize: 50000000,
            maxFiles: 1000,
            level: 'info',
            showLevel: true,
            json: false,
            timestamp: timeStampFormat
        }),
        new (winston.transports.Console)({
            name: 'debug-console',
            colorize: true,
            level: 'debug',
            showLevel: true,
            json: false,
            timestamp: timeStampFormat
        })
    ],
    exceptionHandlers: [
        new (winstonDaily)({
            name: 'exception-file',
            filename: './log/exception',
            datePattern: '_yyyy-MM-dd.log',
            colorize: false,
            maxsize: 50000000,
            maxFiles: 1000,
            level: 'error',
            showLevel: true,
            json: false,
            timestamp: timeStampFormat
        }),
        new (winston.transports.Console)({
            name: 'exception-console',
            colorize: true,
            level: 'debug',
            showLevel: true,
            json: false,
            timestamp: timeStampFormat
        })
    ]
});

// Variable for DB
var database;

// Connect to Database
function connectDB()
{
    // Database Information
    var databaseUrl = 'mongodb://localhost:27017';    // mongodb://[ipAddress]:[Port]

    // Connect to DB
    MongoClient.connect(databaseUrl, function(err, db) {
        if (err) throw err;

        logger.info('Connect to Mongo Database : ' + databaseUrl);

        database = db.db('local');      // db name
    });
}

// Generate the express object
var app = express();

app.set('port', process.env.PORT || 2977);

// Parsing 'application/x-www-form-urlencoded' using body-parser
app.use(bodyParser.urlencoded({ extended: false }));

// Parsing 'application/json' using boody-parser
app.use(bodyParser.json());

// Open the 'public' directory of static
app.use('/public', static(path.join(__dirname, 'public')));
// Open the 'upload' directory for uploading video file
app.use('/VODs', static(path.join('/home/ubuntu/mediaServerStorage', 'VODs')));

// Set the view engine
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Setting cookie-parser
app.use(cookieParser());

// Setting Session
app.use(expressSession({
    secret:'my key',
    resave: true,
    saveUninitialized: true
}));

// Support for multi-server connections(CORS) when clients request ajax
app.use(cors());

// Using multer MiddleWare: Important Time Sequence of using Multer MiddleWare  body-parser->multer->router
var storage = multer.diskStorage({
    destination: function(req, file, callback) {        // Location of uploaded file is stored
        callback(null, '/home/ubuntu/mediaServerStorage/uploads');
    },
    filename: function(req, file, callback) {           // Change the name of uploaded file
        callback(null, file.originalname + Date.now());
    }
});
var upload = multer({
    storage: storage,
    limits: {               // Limit the uploaded file Size and Count
        files: 10,
        fileSize: 1024 * 1024 * 1024 * 10       // 10GB
    }
});

// Auth to user
var authUser = function(database, id, password, callback)
{
    logger.info('Called authUser');

    // Reference 'users' collection
    var users = database.collection('users');

    // Search for user using id & pw
    users.find({"id" : id}, {"password" : password}).toArray(function(err, docs) {
        if (err) {
            callback(err, null);
            return;
        }

        if (docs.length > 0) {
            logger.info('Match the user, ID[%s]', id);
            callback(null, docs);
        } else {
            logger.error('Cannot find matched user');
            callback(null, null);
        }
    });
}

// Add Users
var addUser = function(database, id, password, name, callback)
{
    logger.info('Called addUser : ' + id + ', ' + password + ', ' + name);

    // Reference 'users' collection
    var users = database.collection('users');

    users.insertMany([{"id":id, "password":password, "name":name}], function(err, result) {
        if (err) {
            callback(err, null);
            return;
        }

        if (result.insertedCount > 0) {
            logger.info("Add User Record: " + result.insertedCount);
        } else {
            logger.error("There is Record");
        }

        callback(null, result);
    });
}

// Router
var router = express.Router();

router.route('/process/login').post(function(req, res){
    logger.info('Called /process/login');

    var paramId = req.body.id;
    var paramPassword = req.body.password;

    logger.info("requested id[%s], pw[%s]", paramId, paramPassword);

    if (database) {
        authUser(database, paramId, paramPassword, function(err, docs) {
            if (err) { throw err; }

            if (docs) {
                console.dir(docs);

                // Check the username from database
                var username = docs[0].name;

                res.writeHead('200', {'Content-Type': 'text/html; charset=utf8'});
                // res.write('<h1>Success LOGIN</h1>')
                
                // Sending View Template
                var context = {userid:paramId, username:username};
                req.app.render('login_success', context, function(err, html) {
                    if (err) {
                        logger.error('Error to rendering login success view');

                        res.write('<h2>Error occured when rendering View</h2>');
                        res.write('<p>' + err.stack + '</p>');
                        res.end();

                        return;
                    }

                    res.end(html);
                });
                res.end();
            } else {
                res.writeHead('200', {'Content-Type': 'text/html; charset=utf8'});
                res.write('<h1>Fail to LOGIN</h1>')
                res.end();
            }
        });
    } else {
        res.writeHead('200', {'Content-Type': 'text/html; charset=utf8'});
        res.write('<h1>Fail to Connect DB</h1>')
        res.end();
    }
});

router.route('/process/addUser').post(function(req, res) {
    logger.info('Called /process/addUser');

    var paramId = req.body.id || req.query.id;
    var paramPassword = req.body.password || req.query.password;
    var paramName = req.body.name || req.query.name;

    logger.info('Requested Parameter : ' + paramId + ', ' + paramPassword + ', ' + paramName);

    if (database) {
        addUser(database, paramId, paramPassword, paramName, function(err, result){
            if (err) {throw err;}

            if (result && result.insertedCount > 0) {            // Success to add user
                console.dir(result);

                res.writeHead('200', {'Content-Type':'text/html;charset=utf8'});
                res.write('<h2>Success to User Add</h2>');
                res.end();
            } else {        // Fail to add user
                res.writeHead('200', {'Content-Type':'text/html;charset=utf8'});
                res.write('<h2>Fail to User Add</h2>');
                res.end();
            }
        });
    } else {        // Database is not initialized
        res.writeHead('200', {'Content-Type':'text/html;charset=utf8'});
        res.write('<h2>Fail to Connect DB</h2>');
        res.end();
    }
});

router.route('/process/upload').post(upload.array('fileTest', 1), function(req, res) {
    logger.info('Called /process/upload');

    try {
        var files = req.files;

        console.dir('#===== Uploaded File Info =====#');
        console.dir(req.files[0]);
        console.dir('#=====#');

        // Variable of current File Info
        var originalname = '', filename = '', mimetype = '', size = 0;

        if (Array.isArray(files)) {     // When is an array
            logger.info('File Count of Array : %d', files.length);

            for (var index = 0; index < files.length; index++) {
                originalname = files[index].originalname;
                filename = files[index].name;
                mimetype = files[index].mimetype;
                size = files[index].size;
            }

            logger.info('Current File Info : ' + originalname + ', ' + filename + ', ' + mimetype + ', ' + size);

            // Sending Response
            res.writeHead('200', {'Content-Type':'text/html;charset=utf8'});
            res.write('<h3>Success to File Uploaded</h3>');
            res.write('<hr/>');
            res.write('<p>원본 파일 이름 : ' + originalname + ' -> Stored FileName : ' + filename + '</p>');
            res.write('<p>MIME TYPE : ' + mimetype + '</p>');
            res.write('<p>File Size : ' + size + '</p>');
            res.end();
        }
    } catch(err) {
        console.dir(err.stack);
    }
});

router.route('/hls_sample/:id').get(function(req, res) {
    console.log('Called hls sample');

    var uri = url.parse(req.url).pathname;
    console.log('Path Name: ' + uri);

    console.log('req param id: ' + req.params.id);
    console.log('req param type: ' + path.extname(req.params.id));

    res.writeHead('200', {'Content-Type':'text/html;charset=utf8'});
    res.write('<h3>Success to File Uploaded</h3>');
    res.end();
});


// Router 객체 등록
app.use('/', router)

// ===== 404 Error ===== //
var errorHandler = expressErrorHandler({
    static: {
        '404': './public/404.html'
    }
});

app.use(expressErrorHandler.httpError(404));
app.use(errorHandler);

// Exception Handling
process.on('uncaughtException', (err)=>{
    logger.error('uncaughtException', err);
});

// ===== Server Start ===== //
http.createServer(app).listen(app.get('port'), function() {
    logger.info('Server is Start. Port: ' + app.get('port'));

    connectDB();
});