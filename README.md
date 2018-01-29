# Unoconv-S3 ver. 1.0.0

[https://hub.docker.com/r/blys/unoconv-s3/](https://hub.docker.com/r/blys/unoconv-s3/)

Is a scalable document files format converter service based on nodejs, AWS S3 object sotrage \(and compatible\), libreoffice and unoconv, made to run in a dockerized environment.

### The problem

Let's say that in your application you have to manage the conversion of document files such as MS-Word files, Open Document files, Rich text files, spreadsheets, presentations and so on, to a different format.  
You want to be able to easily scale up this feature as the load of your system grows.

[Unoconv](https://github.com/dagwieers/unoconv) can do conversions for you, exploiting the ability of [LibreOffice](https://www.libreoffice.org/) and [OpenOffice](https://www.openoffice.org/) to **work as a server and without GUI**.

Unfortunately, it has to rely on the local filesystem, that it makes it a bit complicated to scale up in a distributed environment.

### A solution

You can store the files you need to convert, in an Object Store Service such as AWS S3 or Google Cloud Storage, that is an easy and efficient way to makes your files available by every node in your distributed system.

Probably you already have your files in an Object Storage.

So, why don't make Unoconv able to get the files from your Object Storage, convert them and then put them back from where they come?

This is the idea.

Add a simple RESTfull interface to control the process,  pack everything in a Docker container, and you have Unoconv-S3.

NodeJS makes the trick!

## How to use it

You can run it in your laptop as well in a single node multi-container application using docker-compose or in an orchestrated multi-node distributed environment as Docker Swarm or Kubernetes.

In this latter case, the only thing you need to scale up is to say scale n pods or services. No file system mount to manage.

##### Run the the docker image:

```bash
docker run --rm -d -p 80:9080 -e AWS_ACCESS_KEY=<your key> -e AWS_SECRET=<your secret> blys/unoconv-s3
```

Where **AWS\_ACCESS\_KEY** and **AWS\_SECRET** are environment variables to allow the service to connect to your Object Storage.

See also: [aws security credentials](https://docs.aws.amazon.com/general/latest/gr/aws-security-credentials.html)

##### Ask for converting a document file:

From a browser or by CLI with curl.

```bash
http://localhost/my-bucket-name/my-object-key?format=pdf
```

Where **my-bucket-name** is the bucket where the document to convert is stored, and **my-object-key** is the key of the object containing the data of the source file.

Parameter **format** is the target format you wish to obtain.

##### The result:

If nothing different is specified, the converted file will be stored in the same bucket of the original one, with equal object key but different extension.

As result of the HTTP call, you'll get a JSON document describing what is happened.

e.g., Let's say you want to convert an MS-Word file, located in `user-docs` bucket and identified by `my fantastic life.docx`, into a PDF file.

Then call:

```bash
curl "http://localhost/user-docs/my fantastic life.doc?format=pdf"
```

And you'll get something similar to:

```json
{
  "code": 0,
  "text": "conversion complete",
  "beginTime": 1517206908.701,
  "endTime": 1517206910.364,
  "execTime": 1.6630001068115234,
  "result": {
    "key": "my fantastic life.pdf",
    "bucket": "user-docs",
    "data": {
      "ETag": "\"843f90ab9ec5ea23ef23fb18a3cc1551\""
    },
    "metadata": {
      "userdeclaredsize": "149504",
      "userdeclaredtype": "application/msword",
      "masterDocMD5": "ad18fc9a2e1fd4761671e137d3a30fc6"
    }
  }
}
```

**code: 0** says the conversion has succeeded, it took 1.66 seconds, and the converted document is now available in bucket `user-docs` with key `my fantastic life.pdf` .

Additional info are returned such as begin and end time, metadata which has been copied from the source object with in addition a new entry, namely masterDocMD5 whitch is the source object ETag without double quotes.

##### Different bucket and/or object key target:

If you don't want the converted file to be stored in the same bucket of the original one or you want to specify a customized key, you can use two more optional parameters: `dbucket` and `dkey`.

```bash
curl "http://localhost/user-docs/my fantastic life.doc?format=pdf&dkey=my amazing life.pdf&dbucket=converted-user-docs"
```

##### List of available parameters:

| param | meaning | mandatory |
| :--- | :--- | :---: |
| format | identify the target format of the converted file. | true |
| dbucket | name of the bucket where the converted object will be stored. If not specified it will be the same as the source object. | false |
| dkey | key of the converted object. If not specified it will be the same as the source object with the extension changed or added. | false |

### Alternatives to ASW S3 and not deafult region:

If you don't use the actual ASW S3 service, you can use a compatible one.

Some example: [Google Cloud Storage](https://cloud.google.com/storage/docs/interoperability), [Minio](https://www.minio.io/), ...

To make Unoconv-S3 able to point to a different service, you can specify some additional **environment variables**.

| variable | meaning | mandatory |
| :--- | :--- | :---: |
| AWS\_ACCESS\_KEY | AWS, or compatible, unique identifier | true |
| AWS\_SECRET | AWS, or compatible, secret key | true |
| AWS\_ENDPOINT | URL to the alternative service | false |
| AWS\_REGION | the name of the region to use | false |
| AWS\_SSLENABLED | if false it will allow to connect without SSL encryption. True is default | false |
| AWS\_S3FORCEPATHSTYLE | if true it will force the path style. False is default | false |

#### Usage of environment variables:

You can specify them using the `-e` option in `docker run` command.

You can also use them in a docker-compose file, of course.

##### Example:

```yaml
version: '3'
services:
    doc-converter:
        image: blys/unoconv-s3
        environment:
            - AWS_ACCESS_KEY=my-unique-key
            - AWS_SECRET=my-secret-key
            - AWS_ENDPOINT=s3.compatible.service.example.org
            - AWS_REGION=us-east-1
            - AWS_SSLENABLED=true
            - AWS_S3FORCEPATHSTYLE=true        
        networks:
            - objStorage
    doc-uploader:
        image: nginx
        volumes:
            - projFile:/var/www/html
        networks:
            - frontend
            - objStorage
```

### Return codes:

If something goes wrong the service will respond with an appropriate HTTP status code and additional info will be available by code and text parameters of the returned JSON document.

* 0: conversion complete
* 1: missing source object path
* 2: missing destination format
* 3: source object not found
* 4: source object unavailable
* 5: temporary data can't be instantiated
* 6: source datablock can't be retrieved
* 7: converted datablock can't be read
* 8: conversion process can't be started
* 9: conversion process didn't create a converted document
* 10: converted datablock can't be stored

