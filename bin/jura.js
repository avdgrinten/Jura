#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var async = require('async');

var jura = require('../lib/index.js');

function tokenizeArgs(argv) {
	var result = [ ];
	for(var i = 2; i < argv.length; i++) {
		if(argv[i].slice(0, 2) == '--') {
			result.push({ type: 'parameter', name: argv[i] });
		}else if(argv[i].slice(0, 1) == '-') {
			for(var j = 1; j < argv[i].length; j++)
				result.push({ type: 'parameter', name: argv[i].charAt(j) });
		}else{
			result.push({ type: 'word', text: argv[i] });
		}
	}
	return result;
}

function initCommand(args) {
	var repository = new jura.repository.Repository();
	repository.initialize();
	repository.dispose();
}

function listCommand(args) {
	var repository = new jura.repository.Repository();
	repository.load();
	
	console.log("The following files are part of the index:");

	var elems = [ ];
	for(var i = 0; i < repository.numIndexElements(); i++)
		elems.push(repository.getIndexElement(i));
	elems.sort(function(a, b) {
		if(a.getPath() < b.getPath()) {
			return -1;
		}else if(a.getPath() > b.getPath()) {
			return 1;
		}else return 0;
	});
	for(var i = 0; i < elems.length; i++) {
		if(elems[i].getType() == 'file') {
			console.log("   File: " + elems[i].getPath());
		}else if(elems[i].getType() == 'directory') {
			console.log("   Directory: " + elems[i].getPath());
		}else throw new Error("Illegal index element");
	}
}
function addCommand(args) {
	if(args.length == 0)
		throw new Error("Expected arguments: <path1>, <path2>, ...");

	var repository = new jura.repository.Repository();
	repository.load();

	for(var i = 0; i < args.length; i++) {
		if(args[i].type != 'word')
			throw new Error("Expected path argument");
		
		var filepath = path.normalize(args[i].text);
		if(repository.inIndex(filepath))
			continue;
		if(!fs.existsSync(filepath)) {
			console.error("File '" + filepath + "' does not exist");
		}else{
			var stats = fs.lstatSync(filepath);
			if(stats.isFile()) {
				repository.addIndexElement(new jura.repository.Indexed('file', filepath));
			}else if(stats.isDirectory()) {
				repository.addIndexElement(new jura.repository.Indexed('directory', filepath));
			}else throw new Error("'" + filepath + "' is not a file or directory");
		}
	}
	repository.dispose();
}

function mirrorsCommand(args) {
	var repository = new jura.repository.Repository();
	repository.load();

	console.log("Installed mirrors:");
	for(var i = 0; i < repository.numMirrors(); i++) {
		var mirror = repository.getMirror(i);
		console.log("   " + mirror.getName());
	}
}
function addDriveMirrorCommand(args) {
	if(args.length != 2 || args[0].type != 'word' || args[1].type != 'word')
		throw new Error("Expected arguments: <name> <remote root path>");
	
	var repository = new jura.repository.Repository();
	repository.load();
	
	var mirror = new jura.remoteDrive.Mirror(args[0].text);
	mirror.setRootPath(args[1].text);
	repository.addMirror(mirror);

	repository.dispose();
}
function authMirrorCommand(args) {
	if(args.length != 1 || args[0].type != 'word')
		throw new Error("Expected arguments: <mirror>");

	var repository = new jura.repository.Repository();
	repository.load();

	var mirror = repository.getMirrorByName(args[0].text);
	mirror.authorize(function(error) {
		if(error) {
			console.log("Error:", error);
		}else{
			console.log("Success");
		}
		repository.dispose();
	});
}
function initMirrorCommand(args) {
	if(args.length != 1 || args[0].type != 'word')
		throw new Error("Expected arguments: <mirror>");

	var repository = new jura.repository.Repository();
	repository.load();

	var mirror = repository.getMirrorByName(args[0].text);
	mirror.initialize(function(error) {
		if(error) {
			console.log("Error:", error);
		}else{
			console.log("Success");
		}
		repository.dispose();
	});
}

function backupCommand(args) {
	if(args.length != 1 || args[0].type != 'word')
		throw new Error("Expected arguments: <mirror>");
	
	var repository = new jura.repository.Repository();
	repository.load();
	
	var res_archive = new jura.archive.Archive();

	var elems = [ ];
	for(var i = 0; i < repository.numIndexElements(); i++)
		elems.push(i);
	async.each(elems, function(i, callback) {
		var element = repository.getIndexElement(i);
		if(element.getType() == 'file') {
			fs.readFile(element.getPath(), function(error, buffer) {
				if(error) {
					callback(error);
					return;
				}
				res_archive.addEntry(new jura.archive.File(element.getPath(), buffer));
				callback(null);
			});
		}else if(element.getType() == 'directory') {
			res_archive.addEntry(new jura.archive.Directory(element.getPath()));
			callback(null);
		}else throw new Error("Illegal indexed element");
	}, function(error) {
		if(error) {
			console.log("Could pack index");
			console.log("Error:", error);
			return;
		}
		
		var buffer = jura.archive.encodeArchive(res_archive);
		
		var mirror = repository.getMirrorByName(args[0].text);
		mirror.accessRemote(function(error, remote) {
			if(error) {
				console.log("Could not access remote location");
				console.log("Error:", error);
				return;
			}
			
			var now = new Date();
			var name = "Version_" + now.toISOString();
			remote.createFile(name, "application/jura-archive", function(error, file) {
				if(error) {
					console.log("Could not create file " + name);
					console.log("Error:", error);
					return;
				}
				
				file.uploadBuffer(buffer, function(error) {
					if(error) {
						console.log("Error:", error);
					}else{
						console.log("Success");
					}
				});
			});
		});
	});
};

function revListCommand(args) {
	if(args.length != 1 || args[0].type != 'word')
		throw new Error("Expected arguments: <mirror>");
	
	var repository = new jura.repository.Repository();
	repository.load();
	
	var mirror = repository.getMirrorByName(args[0].text);
	mirror.accessRemote(function(error, remote) {
		if(error) {
			console.log("Could not access remote location");
			console.log("Error:", error);
			return;
		}
		
		remote.listFiles(function(error, files) {
			if(error) {
				console.log("Could not retrieve list of files");
				console.log("Error:", error);
				return;
			}
			
			var versions = files.filter(function(file) {
				return file.getName().match(/Version_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
			});

			console.log("Available revisions:");
			for(var i = 0; i < versions.length; i++) {
				var date_regexp = /Version_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;
				var date_result = date_regexp.exec(versions[i].getName())
				console.log("   " + date_result[1]);
			}
		});
	});
}

function revRestoreCommand(args) {
	if(args.length != 2 || args[0].type != 'word' || args[1].type != 'word')
		throw new Error("Expected arguments: <mirror> <revision>");
	
	var repository = new jura.repository.Repository();
	repository.load();
	
	var mirror = repository.getMirrorByName(args[0].text);
	mirror.accessRemote(function(error, remote) {
		if(error) {
			console.log("Could not access remote location");
			console.log("Error:", error);
			return;
		}
		
		remote.accessFile('Version_' + args[1].text, function(error, file) {
			if(error) {
				console.log("Could not access file");
				console.log("Error:", error);
				return;
			}

			var chunks = [ ];

			var download = file.download();
			download.on('data', function(chunk) {
				chunks.push(chunk);
			});
			download.on('end', function() {
				var buffer = Buffer.concat(chunks);
				var res_archive = jura.archive.decodeArchive(buffer);
				jura.archive.unpackTree(res_archive, function() {
					console.log("Success");
				});
			});
		});
	});
}

function printUsage() {
	console.log("Usage: jura <general parameters> command <command arguments>");
	console.log("Commands:");
	console.log("   init                                          Initialize repository");
	console.log("   list                                          List indexed files");
	console.log("   add <path1>, <path2>, ...                     Add file to index");
	console.log("   mirrors                                       List mirrors");
	console.log("   add-drive-mirror <name> <remote root path>    Add Google Drive mirror");
	console.log("   auth-mirror <mirror>                          Authorize mirror");
	console.log("   init-mirror <mirror>                          Initialize mirror");
	console.log("   backup <mirror>                               Backup current revision");
	console.log("   rev-list <mirror>                             List all revisions on a mirror");
	console.log("   rev-restore <mirror> <revision>               Restore the specified revision");
}

function processArgs(args) {
	var k = 0;

	// parse generic parameters
	while(k < args.length && args[k].type == 'parameter') {
		throw new Error("Illegal parameter --" + args[k].name);
	}

	if(k >= args.length || args[k].type != 'word') {
		printUsage();
		return;
	}
	
	if(args[k].text == 'init') {
		initCommand(args.slice(k + 1));
	}else if(args[k].text == 'list') {
		listCommand(args.slice(k + 1));
	}else if(args[k].text == 'add') {
		addCommand(args.slice(k + 1));
	}else if(args[k].text == 'mirrors') {
		mirrorsCommand(args.slice(k + 1));
	}else if(args[k].text == 'add-drive-mirror') {
		addDriveMirrorCommand(args.slice(k + 1));
	}else if(args[k].text == 'auth-mirror') {
		authMirrorCommand(args.slice(k + 1));
	}else if(args[k].text == 'init-mirror') {
		initMirrorCommand(args.slice(k + 1));
	}else if(args[k].text == 'backup') {
		backupCommand(args.slice(k + 1));
	}else if(args[k].text == 'rev-list') {
		revListCommand(args.slice(k + 1));
	}else if(args[k].text == 'rev-restore') {
		revRestoreCommand(args.slice(k + 1));
	}else{
		printUsage();
	}
}

processArgs(tokenizeArgs(process.argv));

