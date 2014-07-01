
# Jura: A backup utility

## Overview

Jura is a backup utility that archives local files and uploads them to
remote locations. Currently only Google Drive storage is supported as a remote location.

## Prerequisites

- node.js version 0.10.x or later

## Installation

Jura can be installed via npm: `npm install jura`.

## Typical workflow

First you'll want to create a new repository and index some files
that you want to backup:
1. `jura init` Initializes the repository. All information about the repository
will be saved in a `.jura` directory in the current working directory
2. `jura add file.txt` Adds a file to the index
3. `jura list` Lists all files that are currently part of the index

After you have added some files to the index you'll want to add a
mirror that will host your backup:
1. `jura add-drive-mirror myMirror backups/someFolder` Adds a mirror.
myMirror is an internal name, you can choose any name you like.
backups/someFolder is the name of the folder on Google Drive that will contain your backups
2. `jura auth-mirror myMirror` Authorize Jura to access your Google Drive
3. `jura init-mirror myMirror` Create the backup folder you specified earlier on Google Drive

After setting things up you can backup your data by running `jura backup myMirror`.

In case you want to restore your backup you would use:
1. `jura rev-list myMirror` This lists all backups you have uploaded
2. `jura rev-restore myMirror 2014-06-29T19:00:32.802Z` Restores the backup from the specified time stamp

