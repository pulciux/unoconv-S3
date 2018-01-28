/*
 * The MIT License
 *
 * Copyright 2018 Gianluigi Belli.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

var AWS = require('aws-sdk');
var http = require('http');
var url = require('url');
var path = require('path');
var replaceExt = require('replace-ext');
var tmp = require('tmp');
var fs = require('fs');
var cproc = require('child_process');
var ps = require('ps-node');

/** Document Converter Service process
 * 
 * @type object
 */
var convListener = {
    name: 'Document Converter Service',
    cmd: 'unoconv',
    cmdParms: ['-l'],
    /** Starts the listener process
     * 
     * @returns {void}
     */
    start: function () {
        console.log(`Starting ${this.name}...`);
        this.isRunning((running) => {   //checks if there is a listener already running
            if (running) {                                  //if the listener is already running
                console.log(`${this.name} alredy running`); //log it and do nothing
            } else {                                        //if the listener is not running
                this.child = cproc.spawn(this.cmd, this.cmdParms);  //spawn the new process

                /** On listener start error
                 * 
                 */
                this.child.on('error', function (err) {
                    console.error(`${this.name} can't be started!`);    //logs the error
                    console.error(err);
                    process.exit(1);                                    //and exit this app
                });

                /** When the listener unexpectedly terminates
                 * 
                 */
                this.child.on('exit', (code) => {
                    console.log(`${this.name} exited with code ${code}`);
                    setTimeout(this.start(), 500);                           //restart the process after 500 milliseconds
                });

                /** When the listener send dato to standard output
                 * 
                 */
                this.child.stdout.on('data', (data) => {
                    console.log(`${this.name}: ${data}`);                   //logs it
                });

                /** When the listener send dato to standard error
                 * 
                 */
                this.child.stderr.on('data', (data) => {
                    console.log(`EE: ${this.name}: ${data}`);               //logs it
                });

                console.log(`${this.name} assigned PID: ${this.child.pid}`);    //logs the assigned PID
            }
        });
    },
    isRunning: function (callback) {
        ps.lookup({
            command: '/usr/lib/libreoffice/program/soffice.bin'
        }, function (err, resultList) {
            if (err) {
                console.log(err);
                process.exit(1);
            }
            callback((resultList.length > 0 ? true : false));
        });
    }
};

/** create a server object
 * 
 * @param {object} req - request
 * @param {object} res - response
 * @returns {undefined}
 */
var httpserver = http.createServer(function (req, res) {                                 //answering the request
    var answerObj = {//answer object for the requesting client
        code: 0,
        text: '',
        beginTime: (Date.now() / 1000),
        endTime: 0.0,
        execTime: 0.0,
        send: function (code, altHTMLStatus, altHTMLStatusDescr, msg, result) {
            var htmlStatus = 200;
            this.code = parseInt(code);
            switch (this.code) {
                case 0:
                    htmlStatus = 200;
                    this.text = 'conversion complete';
                    this.result = result;                               //add the object key to the result
                    break;
                case 1:
                    htmlStatus = 400;
                    this.text = 'missing source object path';
                    break;
                case 2:
                    htmlStatus = 400;
                    this.text = 'missing destination format';
                    break;
                case 3:
                    htmlStatus = 404;
                    this.text = 'source object not found';
                    break;
                case 4:
                    htmlStatus = 400;
                    this.text = 'source object unavailable';
                    break;
                case 5:
                    htmlStatus = 500;
                    this.text = "temporary data can't be instantiated";
                    break;
                case 6:
                    htmlStatus = 500;
                    this.text = "source datablock can't be retrieved";
                    break;
                case 7:
                    htmlStatus = 500;
                    this.text = "converted datablock can't be read";
                    break;
                case 8:
                    htmlStatus = 500;
                    this.text = "conversion process can't be started";
                    break;
                case 9:
                    htmlStatus = 500;
                    this.text = "conversion process didn't created a converted document";
                    break;
                case 10:
                    htmlStatus = 500;
                    this.text = "converted datablock can't be stored";
                    break;
                default:
                    htmlStatus = 500;
                    this.text = 'unexpected result';
            }
            if (typeof altHTMLStatus === 'number')           //it there is an alternative status code
                htmlStatus = parseInt(altHTMLStatus);        //use it instead of the predefined
            if (typeof altHTMLStatusDescr === 'string')      //it there is an alternative status code description
                this.text += ': ' + altHTMLStatusDescr;      //append it to the predefined text result
            if (typeof msg === 'string')                     //it there is an additional message
                this.message = msg;                          //add it in the response
            this.endTime = (Date.now() / 1000);
            this.execTime = this.endTime - this.beginTime;   //calculate execution time
            res.writeHead(htmlStatus, {'Content-Type': 'application/json; charset=UTF-8'}); //send headers and body response
            res.write(JSON.stringify(this));
            res.end();
        }
    };

    var comp_url = url.parse(req.url, true);                              //gets the requested uri components

    var sourceObjCoord = {
        parse: function (urlPath) {
            if (typeof urlPath === 'string') {
                urlPath = decodeURIComponent(urlPath);
                var components = urlPath.split(path.sep);
                if (components.length >= 3) {
                    this.bucket = components[1];                //the 2nd item is the bucket
                    components.splice(0, 2);                    //remove root and bucket
                    this.key = components.join(path.sep);       //build the key
                    this.extension = path.extname(this.key);    //gets source file extension from object key
                }
            }
        }
    };
    sourceObjCoord.parse(comp_url.pathname);                //parse path url to get bucket and key

    /* Starts to analaize the request
     * 
     */
    if (sourceObjCoord.bucket && sourceObjCoord.key) {                                           //check if the request has an object key
        if (typeof comp_url.query.format === 'string' && comp_url.query.format.length > 0) {            //format parameter is mandatory
            console.log(`Requested conversion of ${sourceObjCoord.bucket}/${sourceObjCoord.key} to ${comp_url.query.format}`);
            var s3ObjPrms = {//object coordinates
                Bucket: sourceObjCoord.bucket,
                Key: sourceObjCoord.key
            };

            s3.headObject(s3ObjPrms, function (err, dataSource) {         //checks if the object is available
                if (err) {
                    console.log(err);
                    switch (err.code) {                                   //if is not available sends response according with the reason
                        case 'NotFound':
                            answerObj.send(3, err.statusCode);
                            break;
                        default:
                            answerObj.send(4, err.statusCode, err.code, err.message);
                    }
                } else {                                            //if the object is available
                    tmp.file({mode: 0600, postfix: sourceObjCoord.extension}, function (err, sourceFilePath) {  //try to create a temporary file
                        if (err) {                  //if the temporary file can't be created
                            console.log(err);       //log error
                            answerObj.send(5);      //and send result
                        } else {
                            try {
                                var sourceFileStream = fs.createWriteStream(sourceFilePath);         //set the file to stream data
                                s3.getObject(s3ObjPrms).createReadStream().pipe(sourceFileStream);   //retrieve object data

                                /** Document Converter Process
                                 * 
                                 * @type object
                                 */
                                var convExec = {
                                    name: 'Document Converter Process',
                                    cmd: 'unoconv',
                                    cmdParms: ['-n', '-v', `-f${comp_url.query.format}`, sourceFilePath],
                                    /** Start converter process
                                     * 
                                     * @returns {undefined}
                                     */
                                    start: function () {
                                        console.log(`Starting ${this.name}`);
                                        this.child = cproc.spawn(this.cmd, this.cmdParms);  //spawn the external process

                                        /** When an error during starting external porcess occours
                                         * 
                                         */
                                        this.child.on('error', function (err) {
                                            console.error(`${this.name} can't be started!`);
                                            console.error(err);
                                            answerObj.send(8);
                                        });

                                        /** When the external process ends
                                         * 
                                         */
                                        this.child.on('exit', (code) => {
                                            if (code === 0 && this.convertedFilePath) {                     //if the process is ended with success
                                                var convertedFilePath = this.convertedFilePath;
                                                var convertedFileExtension = this.convertedFileExtension;
                                                fs.readFile(convertedFilePath, function (err, data) {  //try to read the converted document
                                                    if (err) {                  //if it can't be read
                                                        console.log(err);       //log error and send result
                                                        answerObj.send(7);
                                                    } else {                    //if it has been read try to store the converted docmunt in object storage
                                                        if (comp_url.query.dbucket)
                                                            s3ObjPrms.Bucket = comp_url.query.dbucket;                              //set destination bucket if specified
                                                        s3ObjPrms.Key = (comp_url.query.dkey ? comp_url.query.dkey : replaceExt(sourceObjCoord.key, convertedFileExtension));  //set destination key if specified
                                                        s3ObjPrms.Metadata = dataSource.Metadata;                                   //copy metadata from the source document
                                                        s3ObjPrms.Metadata.masterDocMD5 = dataSource.ETag.replace(/^"|"$/g, '');    //add source ETag to destination Metadata
                                                        if (s3ObjPrms.Metadata.name)
                                                            s3ObjPrms.Metadata.name = replaceExt(s3ObjPrms.Metadata.name, convertedFileExtension);  //replace name extension
                                                        s3ObjPrms.Body = data;                              //set the destination datablock
                                                        s3.putObject(s3ObjPrms, function (err, data) {
                                                            if (err) {                  //if the object can't be stored
                                                                console.log(err);       //logs errors
                                                                answerObj.send(10);     //and send response
                                                            } else {                    //if the object has been stored
                                                                answerObj.send(0, null, null, null, {//send response with additional info about result
                                                                    key: s3ObjPrms.Key,
                                                                    bucket: s3ObjPrms.Bucket,
                                                                    data: data,
                                                                    metadata: s3ObjPrms.Metadata
                                                                });
                                                                try {
                                                                    fs.unlink(convertedFilePath);       //unlink temporary files
                                                                    fs.unlink(sourceFilePath);
                                                                } catch (err) {
                                                                    console.log(err);
                                                                }
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {                            //if the process is ended with unsuccess
                                                answerObj.send(9);              //send result
                                            }
                                        });

                                        /** When the external process write data to the standard output
                                         * 
                                         */
                                        this.child.stdout.on('data', (data) => {
                                            var find = data.toString().match(/Output file: file:\/\/(.+)(\n|$)/);
                                            if (find !== null) {                                       //if the output contains the name of the converted file
                                                console.log(`${this.name}: document converted`);
                                                this.convertedFilePath = find[1];                                       //remebers the file name
                                                this.convertedFileExtension = path.extname(this.convertedFilePath);     //and its file extension
                                            }
                                        });

                                        this.child.stderr.on('data', (data) => {
                                            console.log(`${this.name}: ${data}`);
                                        });
                                    }
                                }.start();      //create and start it

                            } catch (err) {
                                console.log(err);       //log error
                                answerObj.send(6);      //and send result
                            }
                        }
                    });
                }
            });
        } else {
            answerObj.send(2);                     //there is no destination format in request
        }
    } else {
        answerObj.send(1);                         //there is no object key in request
    }
});

/** On HTTP server errors
 * 
 */
httpserver.on('error', (err) => {
    console.log(err);
});

/** Prepare for AWS S3 connection
 * 
 * @type type
 */
function setConfig() {
    var config = {};
    if (typeof process.env.AWS_ACCESS_KEY === 'string' && process.env.AWS_ACCESS_KEY) {
        config.accessKeyId = process.env.AWS_ACCESS_KEY;
    } else {
        console.log('missing AWS_ACCESS_KEY: please, set it.');
        process.exit(1);
    }
    if (typeof process.env.AWS_SECRET === 'string' && process.env.AWS_SECRET) {
        config.secretAccessKey = process.env.AWS_SECRET;
    } else {
        console.log('missing AWS_SECRET: please, set it.');
        process.exit(1);
    }
    if (typeof process.env.AWS_ENDPOINT === 'string' && process.env.AWS_ENDPOINT) {
        config.endpoint = process.env.AWS_ENDPOINT;
    }
    if (typeof process.env.AWS_REGION === 'string' && process.env.AWS_REGION) {
        config.region = process.env.AWS_REGION;
    }
    if (process.env.AWS_S3FORCEPATHSTYLE === 'true') {
        config.s3ForcePathStyle = true;
    }
    if (process.env.AWS_SSLENABLED === 'false') {
        config.sslEnabled = false;
    }
    return config;
};

AWS.config.update(setConfig());
var s3 = new AWS.S3();

/** Starts services
 * 
 */
convListener.start();                       //start the conversion listener
httpserver.listen(9080, function () {        //start the http server
    console.log('HTTP server ready to accept requests');
});