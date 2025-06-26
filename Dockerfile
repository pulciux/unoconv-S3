FROM ubuntu

MAINTAINER Gianluigi Belli <gianluigi.belli@blys.it>
LABEL Description="A scalable document files format converter service based on nodejs, AWS S3 object sotrage (and compatible), libreoffice and unoconv" Vendor="blys" Version="1.1.3"

#Service Base dir and default user
ENV UCS3BASEDIR /var/lib/unoconv-s3/
ENV UCS3USER unoconv-s3-run

#Install packages
RUN apt-get update \
    && apt-get install -y \
       adduser \
       nodejs \
       npm \
       libreoffice \
       unoconv \
       file \
       python3-distutils-extra \
       fonts-open-sans \
    && apt-get clean

#Adds a user to run the service
RUN addgroup $UCS3USER \
    && adduser --home $UCS3BASEDIR --disabled-password --ingroup $UCS3USER $UCS3USER

#Copy service files
COPY ./Unoconv-S3.js $UCS3BASEDIR
COPY ./package.json $UCS3BASEDIR
COPY ./README.md $UCS3BASEDIR
COPY ./LICENSE.txt $UCS3BASEDIR
COPY ./ExtraFonts /usr/share/fonts/

#Update font cache
RUN fc-cache -fv

#Install service dependencies
RUN cd $UCS3BASEDIR && npm install

#Set base dir as workdir
WORKDIR $UCS3BASEDIR

#Set the user as executor user
USER $UCS3USER

#Start the service
CMD ["nodejs","Unoconv-S3.js"]