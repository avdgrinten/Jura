
var util = require('util');
var events = require('events');
var read = require('read');
var fs = require('fs');
var https = require('https');

var async = require('async');
var googleapis = require('googleapis');

function Mirror(name) {
	events.EventEmitter.call(this);

	this.p_name = name;
	this.p_rootPath = null;
	this.p_appCredentials = JSON.parse(fs.readFileSync(__dirname + '/../GoogleAppCredentials.json'));
	this.p_refreshToken = null;
}
util.inherits(Mirror, events.EventEmitter);
Mirror.prototype.getName = function() {
	return this.p_name;
};
Mirror.prototype.setRootPath = function(root_path) {
	this.p_rootPath = root_path;
};
Mirror.prototype.loadConfig = function(config) {
	this.p_rootPath = config.rootPath;
	this.p_refreshToken = config.refreshToken;
};
Mirror.prototype.saveConfig = function() {
	return { type: 'drive', name: this.p_name,
		rootPath: this.p_rootPath,
		refreshToken: this.p_refreshToken };
};
Mirror.prototype.authorize = function(callback) {
	var oauth = new googleapis.auth.OAuth2(this.p_appCredentials.clientId,
			this.p_appCredentials.clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
	var url = oauth.generateAuthUrl({ access_type: 'offline',
			scope: 'https://www.googleapis.com/auth/drive' });

	console.log("Please go to the following url to retreive an authorization code:");
	console.log();
	console.log(url);
	console.log();

	var self = this;
	read({ prompt: 'Code:' }, function(error, code) {
		if(error) {
			callback(error);
			return;
		}

		oauth.getToken(code, function(error, tokens) {
			if(error) {
				callback(error);
				return;
			}

			self.p_refreshToken = tokens.refresh_token;
			self.emit('configchange');
			callback(null);
		});
	});
};
Mirror.prototype.initialize = function(callback) {
	var self = this;
	
	var oauth = new googleapis.auth.OAuth2(this.p_appCredentials.clientId,
			this.p_appCredentials.clientSecret, 'urn:ietf:wg:oauth:2.0:oob');

	oauth.setCredentials({ refresh_token: this.p_refreshToken });

	this.p_createCacheDir(function(error) {
		if(error) {
			callback(error, null);
			return;
		}

		googleapis.discover('drive', 'v2')
				.withOpts({ cache: { path: '.jura/GoogleDiscoverCache' } })
				.execute(function(error, client) {
			if(error) {
				callback(error);
				return;
			}

			function createFolder(name, parent_id, callback) {
				client.drive.files.insert({ title: name,
						mimeType: 'application/vnd.google-apps.folder',
						parents: [ { "id": parent_id } ] })
					.withAuthClient(oauth)
					.execute(function(error, result) {
						if(error) {
							callback(error);
							return;
						}
						
						callback(null, result.id);
					});
			}

			function lookupFolder(name, parent_id, callback) {
				client.drive.files.list({ q: "title='" + name + "'"
						+ " and '" + parent_id + "' in parents" })
					.withAuthClient(oauth)
					.execute(function(error, result) {
						if(error) {
							callback(error);
							return;
						}
						
						if(result.items.length > 1)
							throw new Error("Directory is not unique");
						if(result.items.length == 0) {
							createFolder(name, parent_id, callback);
						}else{
							callback(null, result.items[0].id);
						}
					});
			}
			
			var folders = self.p_rootPath.split(/\//);
			
			var folder_id = 'root';
			async.eachSeries(folders, function(folder, callback) {
				lookupFolder(folder, folder_id, function(error, id) {
					if(error) {
						callback(error);
					}else{
						folder_id = id;
						callback();
					}
				});
			}, callback);
		});
	});
};
Mirror.prototype.accessRemote = function(callback) {
	var self = this;
	
	var oauth = new googleapis.auth.OAuth2(this.p_appCredentials.clientId,
			this.p_appCredentials.clientSecret, 'urn:ietf:wg:oauth:2.0:oob');

	oauth.setCredentials({ refresh_token: this.p_refreshToken });
	
	this.p_createCacheDir(function(error) {
		if(error) {
			callback(error, null);
			return;
		}
		
		googleapis.discover('drive', 'v2')
				.withOpts({ cache: { path: '.jura/GoogleDiscoverCache' } })
				.execute(function(error, client) {
			if(error) {
				callback(error, null);
				return;
			}

			function lookupFolder(name, parent_id, callback) {
				client.drive.files.list({ q: "title='" + name + "'"
						+ " and '" + parent_id + "' in parents" })
					.withAuthClient(oauth)
					.execute(function(error, result) {
						if(error) {
							callback(error);
							return;
						}
						
						if(result.items.length > 1)
							throw new Error("Directory is not unique");
						if(result.items.length == 0) {
							createFolder(name, parent_id, callback);
						}else{
							callback(null, result.items[0].id);
						}
					});
			}
			
			var folders = self.p_rootPath.split(/\//);
			
			var folder_id = 'root';
			async.eachSeries(folders, function(folder, callback) {
				lookupFolder(folder, folder_id, function(error, id) {
					if(error) {
						callback(error);
					}else{
						folder_id = id;
						callback();
					}
				});
			}, function(error) {
				if(error) {
					callback(error);
				}else{
					callback(null, new Remote(client, oauth, folder_id));
				}
			});
		});
	});
};
Mirror.prototype.p_createCacheDir = function(callback) {
	fs.exists('.jura/GoogleDiscoverCache', function(exists) {
		if(exists) {
			callback(null);
		}else{
			fs.mkdir('.jura/GoogleDiscoverCache', callback);
		}
	});
};

function Download() {
	events.EventEmitter.call(this);
}
util.inherits(Download, events.EventEmitter);

function File(remote, id, title, mime_type) {
	this.p_remote = remote;
	this.p_id = id;
	this.p_title = title;
	this.p_mimeType = mime_type;
}
File.prototype.getName = function() {
	return this.p_title;
};
File.prototype.uploadBuffer = function(buffer, callback) {
	this.p_remote.p_client.drive.files.update({ fileId: this.p_id })
		.withMedia(this.p_mimeType, buffer.toString('binary'))
		.withAuthClient(this.p_remote.p_oauth)
		.execute(function(error, result) {
			callback(error);
		});
};
File.prototype.download = function() {
	var self = this;

	var download = new Download();

	this.p_remote.p_client.drive.files.get({ fileId: this.p_id })
		.withAuthClient(this.p_remote.p_oauth)
		.execute(function(error, descriptor) {
			if(error)
				throw new Error("files.get() request failed");

			var http_req = https.request(descriptor.downloadUrl, function(http_res) {
				http_res.on('data', function(buffer) {
					download.emit('data', buffer);
				});
				http_res.on('end', function() {
					download.emit('end');
				});
			});
			http_req.setHeader('Authorization', 'Bearer ' + self.p_remote.p_oauth.credentials.access_token);
			http_req.end();
		});

	return download;
};

function Remote(client, oauth, root_id) {
	this.p_client = client;
	this.p_oauth = oauth;
	this.p_rootId = root_id;
}
Remote.prototype.createFile = function(name, mime_type, callback) {
	var self = this;
	this.p_client.drive.files.insert({ title: name, mimeType: mime_type,
			parents: [ { "id": this.p_rootId } ] })
		.withAuthClient(this.p_oauth)
		.execute(function(error, result) {
			if(error) {
				callback(error, null);
			}else{
				callback(null, new File(self, result.id, name, mime_type));
			}
		});
};
Remote.prototype.accessFile = function(name, callback) {
	var self = this;
	this.p_client.drive.children.list({ folderId: this.p_rootId, q: "title='" + name + "'" })
		.withAuthClient(self.p_oauth)
		.execute(function(error, result) {
			if(error) {
				callback(error, null);
			}else{
				if(result.items.length == 0)
					throw new Error("File does not exist");
				if(result.items.length > 1)
					throw new Error("File is not unique");
				callback(null, new File(self, result.items[0].id, name,
						result.items[0].mimeType));
			}
		});
};
Remote.prototype.listFiles = function(callback) {
	var list = [ ];
	
	var self = this;
	function fetchPage(token) {
		function handleResponse(error, result) {
			if(error) {
				callback(error, null);
				return;
			}

			for(var i = 0; i < result.items.length; i++)
				list.push(new File(self, result.items[i].id, result.items[i].title,
						result.items[i].mimeType));
			
			if(result.nextPageToken) {
				fetchPage(result.nextPageToken);
			}else{
				callback(null, list);
			}
		}
	
		if(token) {
			self.p_client.drive.files.list({ folderId: self.p_rootId, pageToken: token,
					q: "'" + self.p_rootId + "' in parents" })
				.withAuthClient(self.p_oauth)
				.execute(handleResponse);
		}else{
			self.p_client.drive.files.list({ folderId: self.p_rootId,
					q: "'" + self.p_rootId + "' in parents" })
				.withAuthClient(self.p_oauth)
				.execute(handleResponse);
		}
	}

	fetchPage(null);
};

module.exports = { Mirror: Mirror };

