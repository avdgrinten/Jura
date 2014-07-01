
var util = require('util');
var fs = require('fs');
var path = require('path');

var async = require('async');

function Entry(name) {
	this.p_name = name;
}
Entry.prototype.getName = function() {
	return this.p_name;
};

function Directory(name) {
	Entry.call(this, name);
}
util.inherits(Directory, Entry);

function File(name, buffer) {
	Entry.call(this, name);

	this.p_buffer = buffer;
}
util.inherits(File, Entry);
File.prototype.getBuffer = function() {
	return this.p_buffer;
};

function Archive() {
	this.p_entries = [ ];
}
Archive.prototype.addEntry = function(entry) {
	this.p_entries.push(entry);
};
Archive.prototype.numEntries = function() {
	return this.p_entries.length;
};
Archive.prototype.getEntry = function(index) {
	return this.p_entries[index];
};
Archive.prototype.join = function(other) {
	for(var i = 0; i < other.p_entries.length; i++)
		this.p_entries.push(other.p_entries[i]);
};

function encodeArchive(archive) {
	var chunks = [ ];
	
	var entries = [ ];
	for(var i = 0; i < archive.numEntries(); i++)
		entries.push(archive.getEntry(i));
	entries.sort(function(entry1, entry2) {
		if(entry1.getName() < entry2.getName()) {
			return -1;
		}else if(entry1.getName() > entry2.getName()) {
			return 1;
		}else return 0;
	});
	
	entries.forEach(function(entry) {
		if(entry instanceof File) {
			chunks.push(new Buffer('File ' + entry.getName() + '\n', 'ascii'));
			chunks.push(new Buffer('Length: ' + entry.getBuffer().length + '\n', 'ascii'));
			chunks.push(new Buffer('\n', 'ascii'));
			chunks.push(entry.getBuffer());
		}else if(entry instanceof Directory) {
			chunks.push(new Buffer('Directory ' + entry.getName() + '\n', 'ascii'));
			chunks.push(new Buffer('\n', 'ascii'));
		}else throw new Error("Illegal entry");
	});
	
	return Buffer.concat(chunks);
}

function decodeArchive(buffer) {
	var offset = 0;

	function readLine() {
		var chars = [ ];
		while(true) {
			if(offset >= buffer.length)
				throw new Error("Unexpected end-of-file");
			if(buffer[offset] == '\n'.charCodeAt(0)) {
				offset++;
				break;
			}
			chars.push(String.fromCharCode(buffer[offset]));
			offset++;
		}
		return chars.join('');
	}

	var archive = new Archive();
	
	while(offset < buffer.length) {
		var entry_line = readLine();

		var entry_match = /(\w+) (.*)/.exec(entry_line);
		var type = entry_match[1];
		var path = entry_match[2];

		var length_header = null;
		while(true) {	
			var header_line = readLine();
			if(header_line.length == 0)
				break;
			
			var header_match = /([\w-]+): (.*)/.exec(header_line);
			var field = header_match[1];
			var value = header_match[2];
			
			if(field == 'Length') {
				length_header = parseInt(value);
			}else throw new Error("Illegal header field");
		}

		if(type == 'File') {
			if(length_header == null)
				throw new Error("Expected Length header");
			if(offset + length_header > buffer.length)
				throw new Error("Unexpected end-of-file");
			var content = buffer.slice(offset, offset + length_header)
			offset += length_header;
			
			archive.addEntry(new File(path, content));
		}else if(type == 'Directory') {
			archive.addEntry(new Directory(path));
		}else throw new Error("Illegal entry in directory");
	}
	return archive;
}

function packTree(base, relative, callback) {
	var archive = new Archive();
	fs.readdir(base + '/' + relative, function(error, files) {
		if(error)
			throw new Error("Error during readdir()");
		async.each(files, function(file, callback) {
			fs.lstat(base + '/' + relative + '/' + file, function(error, stats) {
				if(error)
					throw new Error("Error during lstat()");
				if(stats.isFile()) {
					console.log("Adding file " + base + '/' + relative + '/' + file);
					fs.readFile(base + '/' + relative + '/' + file, function(error, buffer) {
						archive.addEntry(new File(relative + '/' + file, buffer));
						callback();
					});
				}else if(stats.isDirectory()) {
					console.log("Adding directory " + base + '/' + relative + '/' + file);
					archive.addEntry(new Directory(base + '/' + relative + '/' + file));
					packTree(base, relative + '/' + file, function(error, sub_archive) {
						archive.join(sub_archive);
						callback();
					});
				}else{
					console.log("Skipping file " + base + '/' + relative + '/' + file);
					callback();
				}
			});
		}, function() {
			callback(null, archive);
		});
	});
}

function unpackTree(archive, callback) {
	var elems = [ ];
	for(var i = 0; i < archive.numEntries(); i++)
		elems.push(i);
	
	async.eachSeries(elems, function(i, callback) {
		var entry = archive.getEntry(i);
		if(entry instanceof File) {
			fs.exists(entry.getName(), function(exists) {
				if(exists) {
					console.log("File '" + entry.getName() + "' already exists; skipping this file");
					callback();
					return;
				}
				console.log("Extracting file " + entry.getName());
				fs.writeFile(entry.getName(), entry.getBuffer(), callback);
			});
		}else if(entry instanceof Directory) {
			fs.exists(entry.getName(), function(exists) {
				if(exists) {
					console.log("Directory '" + entry.getName() + "' already exists; skipping this directory");
					callback();
					return;
				}
				console.log("Creating directory " + entry.getName());
				fs.mkdir(entry.getName(), callback);
			});
		}else throw new Error("Illegal entry");
	}, callback);
}

module.exports = {
	Entry: Entry,
	Directory: Directory,
	File: File,
	Archive: Archive,
	encodeArchive: encodeArchive,
	decodeArchive: decodeArchive,
	packTree: packTree,
	unpackTree: unpackTree
};

