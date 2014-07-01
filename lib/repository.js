
var fs = require('fs');

var remoteDrive = require('./remoteDrive.js');

function Indexed(type, path) {
	this.p_type = type;
	this.p_path = path;
}
Indexed.prototype.getType = function() {
	return this.p_type;
};
Indexed.prototype.getPath = function() {
	return this.p_path;
};

function Repository() {
	this.p_index = null;
	this.p_indexDirty = false;
	
	this.p_mirrors = null;
	this.p_mirrorsDirty = false;
};
Repository.prototype.load = function() {
	var self = this;
	
	if(!fs.existsSync('.jura'))
		throw new Error("There is no jura repository");

	this.p_index = [ ];
	var index_data = JSON.parse(fs.readFileSync('.jura/Index.json'));
	for(var i = 0; i < index_data.length; i++) {
		this.p_index.push(new Indexed(index_data[i].type, index_data[i].path));
	}

	this.p_mirrors = [ ];
	var mirror_config = JSON.parse(fs.readFileSync('.jura/Mirrors.json'));
	for(var i = 0; i < mirror_config.length; i++) {
		if(mirror_config[i].type == 'drive') {
			var mirror = new remoteDrive.Mirror(mirror_config[i].name);
			mirror.on('configchange', function() {
				self.p_mirrorsDirty = true;
			});
			
			mirror.loadConfig(mirror_config[i]);
			this.p_mirrors.push(mirror);
		}else throw new Error("Illegal mirror type");
	}
};
Repository.prototype.initialize = function() {
	fs.mkdirSync('.jura');

	this.p_index = [ ];
	this.p_indexDirty = true;
	
	this.p_mirrors = [ ];
	this.p_mirrorsDirty = true;
};
Repository.prototype.addIndexElement = function(element) {
	this.p_index.push(element);
	this.p_indexDirty = true;
};
Repository.prototype.numIndexElements = function() {
	return this.p_index.length;
};
Repository.prototype.getIndexElement = function(i) {
	return this.p_index[i];
};
Repository.prototype.inIndex = function(filepath) {
	for(var i = 0; i < this.p_index.length; i++)
		if(this.p_index[i].path == filepath)
			return true;
	return false;
};
Repository.prototype.addMirror = function(mirror) {
	this.p_mirrors.push(mirror);
	this.p_mirrorsDirty = true;
};
Repository.prototype.numMirrors = function() {
	return this.p_mirrors.length;
};
Repository.prototype.getMirror = function(i) {
	return this.p_mirrors[i];
};
Repository.prototype.getMirrorByName = function(name) {
	for(var i = 0; i < this.p_mirrors.length; i++)
		if(this.p_mirrors[i].getName() == name)
			return this.p_mirrors[i];
	return null;
};
Repository.prototype.dispose = function() {
	if(this.p_indexDirty)
		this.saveIndex();
	if(this.p_mirrorsDirty)
		this.saveMirrors();
};
Repository.prototype.saveIndex = function() {
	var index_data = [ ];
	for(var i = 0; i < this.p_index.length; i++)
		index_data.push({ type: this.p_index[i].getType(), path: this.p_index[i].getPath() });
	fs.writeFileSync('.jura/Index.json', JSON.stringify(index_data));
};
Repository.prototype.saveMirrors = function() {
	var mirror_config = [ ];
	for(var i = 0; i < this.p_mirrors.length; i++)
		mirror_config.push(this.p_mirrors[i].saveConfig());
	fs.writeFileSync('.jura/Mirrors.json', JSON.stringify(mirror_config));
};

module.exports = { Indexed: Indexed,
		Repository: Repository };

