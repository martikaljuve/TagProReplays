	tileSize = 40
	
	can = document.createElement('canvas')
	can.id = 'mapCanvas'
	document.body.appendChild(can)

	can = document.getElementById('mapCanvas')
	can.width = 32*tileSize
	can.height = 20*tileSize
	can.style.zIndex = 200
	can.style.position = 'absolute'
	can.style.top = 0
	can.style.left = 0


	context = can.getContext('2d')
	
	img = new Image()
	img.src = 'img/tiles.png'
	img.id = 'tiles'
	img = document.body.appendChild(img)

	portalImg = new Image()
	portalImg.src = 'img/portal.png'
	portalImg.id = 'portal'
	portalImg = document.body.appendChild(portalImg)

	speedpadImg = new Image()
	speedpadImg.src = 'img/speedpad.png'
	speedpadImg.id = 'speedpad'
	speedpadImg = document.body.appendChild(speedpadImg)

	speedpadredImg = new Image()
	speedpadredImg.src = 'img/speedpadred.png'
	speedpadredImg.id = 'speedpadred'
	speedpadredImg = document.body.appendChild(speedpadredImg)

	speedpadblueImg = new Image()
	speedpadblueImg.src = 'img/speedpadblue.png'
	speedpadblueImg.id = 'speedpadblue'
	speedpadblueImg = document.body.appendChild(speedpadblueImg)

	tagproImg = new Image()	
	tagproImg.src = 'img/tagpro.png'
	tagproImg.id = 'tagpro'
	tagproImg = document.body.appendChild(tagproImg)

	rollingbombImg = new Image()
	rollingbombImg.src = 'img/rollingbomb.png'
	rollingbombImg.id = 'rollingbomb'
	rollingbombImg = document.body.appendChild(rollingbombImg)


// This function opens a download dialog
function saveVideoData(name, data) {
	var file = data
	var a = document.createElement('a');
    a.download = name;
    a.href = (window.URL || window.webkitURL).createObjectURL(file);
	var event = document.createEvent('MouseEvents');
	event.initEvent('click', true, false);
	a.dispatchEvent(event);    
    (window.URL || window.webkitURL).revokeObjectURL(a.href);
}

// Actually does the rendering of the movie 
function renderVideo(positions) {
	positions = JSON.parse(positions)
	mapImgData = drawMap(0, 0, positions)
	mapImg = new Image()
	mapImg.src = mapImgData
	console.log(positions)
	for(j in positions) {
		if(positions[j].me == 'me') {
			me = j
		}
	}
	var encoder = new Whammy.Video(positions[me].fps); 

	for(thisI = 0; thisI < positions.clock.length; thisI++) {
		animateReplay(thisI, positions, mapImg)
		encoder.add(context)
	}
	output = encoder.compile()
	return(output)
}

// this is a function to get all the keys in the object store
//   It sends a message to the content script once it gets the keys 
function listItems() {
	allKeys = []
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.openCursor(null);
	request.onsuccess=function(){
		if(request.result){
			allKeys.push(request.result.key);
			request.result.continue()
		} else {
			chrome.tabs.sendMessage(tabNum, {method:"itemsList",title:allKeys}) 
    		console.log('sent reply: ' + allKeys)
    	}
	}
}

// this is a function to get position data from the object store
//   It sends a message to the content script once it gets the data 
function getPosData(dataFileName) {
	positionData = []
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.get(dataFileName);
	request.onsuccess=function(){
		thisObj = request.result.value
		chrome.tabs.sendMessage(tabNum, {method:"positionData",title:request.result}) 
    	console.log('sent reply')
	}
}

// this gets position data from object store so that it can be downloaded by user.
function getPosDataForDownload(dataFileName) {
	positionData = []
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.get(dataFileName);
	request.onsuccess=function(){
		chrome.tabs.sendMessage(tabNum, {method:"positionDataForDownload",
										 fileName:dataFileName,
										 title:request.result}) 
    	console.log('sent reply - '+dataFileName)
	}
}

// this deletes data from the object store
function deleteData(dataFileName) {
	var transaction = db.transaction(["positions"], "readwrite");
	var store = transaction.objectStore("positions");
	request = store.delete(dataFileName)
	request.onsuccess=function(){
		chrome.tabs.sendMessage(tabNum, {method:'dataDeleted'})
		console.log('sent reply')
	}
}

// this renames data in the object store
function renameData(oldName, newName) {
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.get(oldName);
	request.onsuccess=function(){
		thisObj = request.result
		var transaction2 = db.transaction(["positions"], "readwrite");
		var store = transaction2.objectStore("positions");
		request = store.delete(oldName)
		request.onsuccess=function(){
			transaction3 = db.transaction(["positions"], "readwrite")
			objectStore = transaction3.objectStore('positions')
			request = objectStore.add(thisObj, newName)
			request.onsuccess = function() {
				chrome.tabs.sendMessage(tabNum, {method:"fileRenameSuccess"}) 
    			console.log('sent reply')
			}
		}
	}
}

// this renders a movie and stores it in the savedMovies FileSystem
function renderMovie(name) {
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.get(name);
	request.onsuccess=function(){
		if(typeof JSON.parse(request.result).clock !== "undefined") {
			var output = renderVideo(request.result)
			createFileSystem(saveMovieFile, [name, output])
			chrome.tabs.sendMessage(tabNum, {method:"movieRenderConfirmation"})
  		} else {
  			chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  				tabNum = tabs[0].id
  				chrome.tabs.sendMessage(tabNum, {method:"movieRenderFailure"}) 
    			console.log('sent movie render failure notice')
  			})
  		}
  	}
}

// this downloads a rendered movie (found in the FileSystem) to disk
function downloadMovie(name) {
	//var nameDate = name.replace(/.*DATE/,'').replace('replays','')
	createFileSystem(getMovieFile, [name])
}
 	


// Set up indexedDB
var openRequest = indexedDB.open("ReplayDatabase");
openRequest.onupgradeneeded = function(e) {
	console.log("running onupgradeneeded");
	var thisDb = e.target.result;
	//Create Object Store
	if(!thisDb.objectStoreNames.contains("positions")) {
		console.log("I need to make the positions objectstore");
		var objectStore = thisDb.createObjectStore("positions", { autoIncrement:true }); 
	}
	if(!thisDb.objectStoreNames.contains("savedMovies")) {
		console.log("I need to make the savedMovies objectstore");
		var objectStore = thisDb.createObjectStore("savedMovies", { autoIncrement:true }); 
	}
}
 
openRequest.onsuccess = function(e) {
	db = e.target.result;
	db.onerror = function(e) {
		alert("Sorry, an unforseen error was thrown.");
		console.log("***ERROR***");
		console.dir(e.target);
	}
 
	if(!db.objectStoreNames.contains("positions")) {
		version = db.version
		db.close()
		secondRequest = indexedDB.open("ReplayDatabase", version + 1)
		secondRequest.onupgradeneeded = function(e) {
			console.log("running onupgradeneeded");
			var thisDb = e.target.result;
			//Create Object Store
			if(!thisDb.objectStoreNames.contains("positions")) {
				console.log("I need to make the positions objectstore");
				var objectStore = thisDb.createObjectStore("positions", { autoIncrement:true }); 
			}
			if(!thisDb.objectStoreNames.contains("savedMovies")) {
				console.log("I need to make the savedMovies objectstore");
				var objectStore = thisDb.createObjectStore("savedMovies", { autoIncrement:true }); 
			}	
		}
		secondRequest.onsuccess = function(e) {
			db = e.target.result
		}
	}
	if(!db.objectStoreNames.contains("savedMovies")) {
		version = db.version
		db.close()
		secondRequest = indexedDB.open("ReplayDatabase", version + 1)
		secondRequest.onupgradeneeded = function(e) {
			console.log("running onupgradeneeded");
			var thisDb = e.target.result;
			//Create Object Store
			if(!thisDb.objectStoreNames.contains("positions")) {
				console.log("I need to make the positions objectstore");
				var objectStore = thisDb.createObjectStore("positions", { autoIncrement:true }); 
			}
			if(!thisDb.objectStoreNames.contains("savedMovies")) {
				console.log("I need to make the savedMovies objectstore");
				var objectStore = thisDb.createObjectStore("savedMovies", { autoIncrement:true }); 
			}	
		}
		secondRequest.onsuccess = function(e) {
			db = e.target.result
		}
	}
}

var title;
chrome.runtime.onMessage.addListener(function(message,sender,sendResponse){
  if(message.method == 'setPositionData') {
    transaction = db.transaction(["positions"], "readwrite")
	objectStore = transaction.objectStore('positions')
	console.log('got data from content script.')
	request = objectStore.add(message.positionData, 'replays'+new Date().getTime())
	request.onsuccess = function() {
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  			tabNum = tabs[0].id
  			chrome.tabs.sendMessage(tabNum, {method:"dataSetConfirmationFromBG"}) 
    		console.log('sent confirmation')
  		})
  	}
  } else if(message.method == 'requestData') {
    console.log('got data request for '+message.fileName)
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		getPosData(message.fileName)
  	})
  } else if(message.method == 'requestList') {
	console.log('got list request')
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		listItems()
  	})
  } else if(message.method == 'requestDataForDownload') {
  	console.log('got data request for download - '+ message.fileName)
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		getPosDataForDownload(message.fileName)
  	})
  } else if(message.method == 'requestDataDelete') {
  	console.log('got delete request for '+message.fileName)
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		deleteData(message.fileName)
  	})
  } else if(message.method == 'requestFileRename') {
  	console.log('got rename request for '+message.oldName+' to '+message.newName)
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		renameData(message.oldName, message.newName)
  	})
  } else if(message.method == 'renderMovie') {
  	console.log('got request to render Movie for '+message.name)
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		renderMovie(message.name)
  	})
  } else if(message.method == 'downloadMovie') {
  	console.log('got request to download Movie for '+message.name)
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		downloadMovie(message.name)
  	})
  }
});

