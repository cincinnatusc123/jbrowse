/**
 * Construct a new Browser object.
 * @class This class is the main interface between JBrowse and embedders
 * @constructor
 * @param params a dictionary with the following keys:<br>
 * <ul>
 * <li><code>containerID</code> - ID of the HTML element that contains the browser</li>
 * <li><code>refSeqs</code> - list of reference sequence information items (usually from refSeqs.js)</li>
 * <li><code>trackData</code> - list of track data items (usually from trackInfo.js)</li>
 * <li><code>dataRoot</code> - (optional) URL prefix for the data directory</li>
 * <li><code>browserRoot</code> - (optional) URL prefix for the browser code</li>
 * <li><code>tracks</code> - (optional) comma-delimited string containing initial list of tracks to view</li>
 * <li><code>location</code> - (optional) string describing the initial location</li>
 * <li><code>defaultTracks</code> - (optional) comma-delimited string containing initial list of tracks to view if there are no cookies and no "tracks" parameter</li>
 * <li><code>defaultLocation</code> - (optional) string describing the initial location if there are no cookies and no "location" parameter</li>
 * </ul>
 */

var Browser = function(params) {
    dojo.require("dojo.dnd.Source");
    dojo.require("dojo.dnd.Moveable");
    dojo.require("dojo.dnd.Mover");
    dojo.require("dojo.dnd.move");
    dojo.require("dijit.layout.ContentPane");
    dojo.require("dijit.layout.BorderContainer");

    //my stuff
    dojo.require("dojo.cache");
    dojo.require("dijit.form.Form");
    dojo.require("dijit.form.Button");
    dojo.require("dijit.form.TextBox");
    dojo.require("dojox.form.FileInput");
    dojo.require("dijit.form.CheckBox");
    dojo.require("dojo.io.iframe");
    dojo.require("dojox.layout.ExpandoPane");
    dojo.require("dijit.layout.AccordionContainer");
    dojo.require("dijit.form.VerticalSlider");
    dojo.require("dijit.Tree");
    dojo.require("dijit.tree.dndSource");
    dojo.require("dijit.tree.TreeStoreModel");
    dojo.require("dojox.data.FileStore");
    // end my stuff

    var refSeqs = params.refSeqs;
    this.trackData = params.trackData;
    var globals = params.globals;
    this.deferredFunctions = [];
    this.dataRoot = params.dataRoot;
    var dataRoot;
    if ("dataRoot" in params)
        dataRoot = params.dataRoot;
    else
        dataRoot = "";

    this.names = new LazyTrie(dataRoot + "/names/lazy-",
			      dataRoot + "/names/root.json");
    this.tracks = [];
    for( track in this.trackData ){
        this.tracks.push( this.trackData[track]["key"] );
    }
    var brwsr = this;
    brwsr.isInitialized = false;
    dojo.addOnLoad(
        function() {
            //set up top nav/overview pane and main GenomeView pane
            dojo.addClass(document.body, "tundra");
            brwsr.container = dojo.byId(params.containerID);
            brwsr.container.genomeBrowser = brwsr;
            var topPane = document.createElement("div");
            brwsr.container.appendChild(topPane);

            var overview = document.createElement("div");
            overview.className = "overview";
            overview.id = "overview";
            topPane.appendChild(overview);
            //try to come up with a good estimate of how big the location box
            //actually has to be
            var maxBase = refSeqs.reduce(function(a,b) {return a.end > b.end ? a : b;}).end;
            var navbox = brwsr.createNavBox(topPane, (2 * (String(maxBase).length + (((String(maxBase).length / 3) | 0) / 2))) + 2, params);

            var viewElem = document.createElement("div");
            brwsr.container.appendChild(viewElem);
            viewElem.className = "dragWindow";

            var containerWidget = new dijit.layout.BorderContainer({
                liveSplitters: false,
                design: "headline",
                gutters: false
            }, brwsr.container);

            var brdrclr = "#929292";
            var contentWidget = new dijit.layout.ContentPane({
                region: "top", 
                layoutPriority: "1",
                style: "border-left: solid "+brdrclr
            }, topPane);

            var browserWidget = new dijit.layout.ContentPane({
                region: "center",
                style: "border-left: solid "+brdrclr 
            }, viewElem);

            //for depth slider
            var sliderPane = document.createElement("div");
            brwsr.container.appendChild( sliderPane );
            var sliderPaneWidget = new dijit.layout.ContentPane(
                                        {region: "right",
                                         style: "width: 20px; padding-top: 15px;",
                                         layoutPriority: "2"}, sliderPane);

            var sliderDiv = document.createElement("div");
            sliderPane.appendChild( sliderDiv );
            brwsr.maxRender = 50;            
            absMaxRender = 300;
            //remember: want to have slider at the top mean render 0
            var slider = new dijit.form.VerticalSlider(
                            {name: "vertical",
                             value: absMaxRender - brwsr.maxRender,
                             minimum: 0,
                             maximum: absMaxRender,
                             intermediateChanges: false,
                             style: "height: 100%;",
                             onChange: function(value){ 
                                            brwsr.maxRender = parseInt(value);
                                            dojo.forEach( brwsr.view.tracks, 
                                                          function(track){ 
                                                              track.setMaxRender( absMaxRender-brwsr.maxRender );
                                                              track.clear(); 
                                                          } );
                                            brwsr.view.showVisibleBlocks(true);
                                        }
                            },
                            sliderDiv);

            //create location trapezoid
            brwsr.locationTrap = document.createElement("div");
            brwsr.locationTrap.className = "locationTrap";
            topPane.appendChild(brwsr.locationTrap);
            topPane.style.overflow="hidden";

            //set up ref seqs
            brwsr.allRefs = {};
            for (var i = 0; i < refSeqs.length; i++)
                brwsr.allRefs[refSeqs[i].name] = refSeqs[i];

            var refCookie = dojo.cookie(params.containerID + "-refseq");
            brwsr.refSeq = refSeqs[0];
            for (var i = 0; i < refSeqs.length; i++) {
                brwsr.chromList.options[i] = new Option(refSeqs[i].name,
                                                        refSeqs[i].name);
                if (refSeqs[i].name.toUpperCase() == String(refCookie).toUpperCase()) {
                    brwsr.refSeq = brwsr.allRefs[refSeqs[i].name];
                    brwsr.chromList.selectedIndex = i;
                }
            }

            dojo.connect(brwsr.chromList, "onchange", function(event) {
                    var oldLocMap = dojo.fromJson(dojo.cookie(brwsr.container.id + "-location")) || {};
                    var newRef = brwsr.allRefs[brwsr.chromList.options[brwsr.chromList.selectedIndex].value];

                    if (oldLocMap[newRef.name])
                        brwsr.navigateTo(newRef.name + ":"
                                         + oldLocMap[newRef.name]);
                    else
                        brwsr.navigateTo(newRef.name + ":"
                                         + (((newRef.start + newRef.end) * 0.4) | 0)
                                         + " .. "
                                         + (((newRef.start + newRef.end) * 0.6) | 0));
                        });

            //hook up GenomeView
            var gv = new GenomeView(viewElem, 250, brwsr.refSeq, 1/200);
            brwsr.view = gv;
            brwsr.viewElem = viewElem;
            //gv.setY(0);
            viewElem.view = gv;

            //hook up InterestingAreas
            console.log( "setting up end to be: " + brwsr.refSeq.end+1 );
            brwsr.interestingAreas = new InterestingAreas( brwsr.refSeq.start, brwsr.refSeq.end+1 );

            dojo.connect(browserWidget, "resize", function() {
                    gv.sizeInit();

                    brwsr.view.locationTrapHeight = dojo.marginBox(navbox).h;
                    gv.showVisibleBlocks();
                    gv.showFine();
                    gv.showCoarse();
                });
            brwsr.view.locationTrapHeight = dojo.marginBox(navbox).h;

            dojo.connect(gv, "onFineMove", brwsr, "onFineMove");
            dojo.connect(gv, "onCoarseMove", brwsr, "onCoarseMove");

            //set up track list
            //var trackListDiv = brwsr.createTrackList(brwsr.container, params);
            brwsr.createTrackList2( brwsr, containerWidget, params );

            containerWidget.startup();

            brwsr.isInitialized = true;

            //set initial location
            var oldLocMap = dojo.fromJson(dojo.cookie(brwsr.container.id + "-location")) || {};

            if (params.location) {
                brwsr.navigateTo(params.location);
            } else if (oldLocMap[brwsr.refSeq.name]) {
                brwsr.navigateTo(brwsr.refSeq.name
                                 + ":"
                                 + oldLocMap[brwsr.refSeq.name]);
            } else if (params.defaultLocation){
                brwsr.navigateTo(params.defaultLocation);
            } else {
                brwsr.navigateTo(brwsr.refSeq.name
                                 + ":"
                                 + ((((brwsr.refSeq.start + brwsr.refSeq.end)
                                      * 0.4) | 0)
                                    + " .. "
                                    + (((brwsr.refSeq.start + brwsr.refSeq.end)
                                        * 0.6) | 0)));
            }

            //if someone call/cs methods on this browser object
            //before it's fully initialized, then we defer
            //those functions until now
            for (var i = 0; i < brwsr.deferredFunctions.length; i++)
                brwsr.deferredFunctions[i]();
            brwsr.deferredFunctions = [];
        });
};

Browser.prototype.createTrackList2 = function(brwsr, parent, params) {
    
    var accordion = new dijit.layout.AccordionContainer(
        {id: "accordion",  //7 
	     title: "accordion",
         region: "left",
         style: "width: 20%; background-color:#0000FF; border-style: none solid none none; border-color: #929292",
         splitter: "false"
        }).placeAt(parent);

    //var form_pane =  new dijit.layout.ContentPane( //new dojox.layout.ExpandoPane(
    //{id: "form_pane", //8
    //title: "Manage",
    ////region: "bottom",
    //style: "background-color:#efefef;",
    ////splitter: "true"
    //}).placeAt(accordion);

   ///////////////////////////////////////////////////////////////////////////////////////////////////////
   //                     Query Stuff
   ///////////////////////////////////////////////////////////////////////////////////////////////////////

    var query_bc = new dijit.layout.BorderContainer(
        {id:"query_bc", //9
         title: "Query",
         //region: "top",
         style: "background-color: #efefef; border-style: none solid none none; border-color: #929292",
         //splitter: "true",
         selected: "true"
        }).placeAt(accordion);

    var query_cpane = new dijit.layout.ContentPane( 
        {id : "query_cpane",
         title : "Query",
         region : "center",
         layoutPriority: "0",
         style : "background-color: #efefef"
        }).placeAt(query_bc);

    var query_div = document.createElement("div");
    query_div.id = "query_div";
    query_cpane.domNode.appendChild( query_div );

    var query_name_p = document.createElement("p");
    query_name_p.id = "query_name_p";
    query_name_p.innerHTML = "Name<br />";
    query_div.appendChild( query_name_p );

    var query_name = new dijit.form.TextBox(
                        {id: "query_name",
                         label: "Query Name",
                         name: "query_name"}
                     ).placeAt( query_name_p );

    var query_box_p = document.createElement("p");
    query_box_p.id = "query_box_p";
    query_box_p.innerHTML = "Query<br />";
    query_div.appendChild( query_box_p );

    var query_box = new dijit.form.TextBox(
                        {id : "query_box",
                         name: "query_box",
                         style: "height: 12em; width: 90%"}
                    ).placeAt( query_box_p );

    var query_donor_bam = new dijit.form.TextBox(
                        {id: "query_donor_bam",
                         name: "query_donor_bam",
                         value: globals.root_dir + "/genomequery/biosql_compiler/biosql/indexing/indexed/evidence.dist.1000.1M.5.sorted.bam",
                         type: "hidden"}
                    ).placeAt( query_div );

    var host_chrom = new dijit.form.TextBox(
                        {id: "host_chrom",
                         name: "host_chrom",
                         value: brwsr.refSeq.name,
                         type: "hidden"}
                     ).placeAt( query_div );        
    
    var runQuery = function( disableCallback, enableCallback ){
        var query_name = dojo.byId("query_name").value;
        if( dojo.byId("query_box").value == "" ){
            alert("You must enter a valid query");
        }
        else if( query_name == "" ){
            alert("You must enter a name for ths query");
        }
        else if( hasNameConflict( query_name ) ){
            alert( "There is already a query with that name" );
        }
        else {
            var xhrArgs = {
                url: "bin/run_query.py",
                form: dojo.byId("query_form"),
                handleAs: "json",
                load: function(data,ioargs){
                    if( data["status"] == "ok" ){
                        //refresh track data, this first request is a kludge:
                        //when site is initially loaded and first query run, 
                        //just one xhrGet didn't load the modified trackInfo.js
                        dojo.xhrGet({
                            url: "data/trackInfo.js",
                            handleAs: "json",
                            load: function(data,args){
                                var a =1;
                            },
                            error: function(data,args){
                                var a = 1;
                            }
                        });

                        dojo.xhrGet({
                            url: "data/trackInfo.js",
                            handleAs: "json",
                            load: function(data,args){
                                brwsr.trackData = data;
                            },
                            error: function(data,args){
                                alert("trackINfo not successfully reloaded");
                            }
                        });
                        brwsr.tracks.push( query_name );
                        enableCallback();
                        refreshTree();
                    }
                    else{
                        alert( data["message"] );
                        enableCallback();
                    }
                },
                error: function(error) {
                    alert(error);
                    enableCallback();
                }
            };
            //Call the asynchronous xhrPost
            var deferred = dojo.xhrPost(xhrArgs);
            disableCallback();
        }

    };

    var query_button = new dijit.form.Button(
                            {id: "query_button", 
                             label: "Run Query",
                             style: "align-text: right;",
                             onClick: 
                                 function(){
                                    buttons = [query_button,
                                               query_box, query_name];
                                    var disableCallback = function() {
                                        dojo.forEach( buttons, toggler("disabled",true) );
                                    };
                                    var enableCallback = function(){ 
                                        dojo.forEach( buttons, toggler("disabled",false) );
                                    };
                                    runQuery(disableCallback,enableCallback);
                                }
                       }).placeAt( query_div );
 
    var query_form = new dijit.form.Form(
                         {id: "query_form",
                          encType : "multipart/form-data"},
                     query_div )


    ////////////////////////////////////////////////////////////////////////////////////////////////
    //                        Explorer Stuff
    ///////////////////////////////////////////////////////////////////////////////////////////////

   var explorer_bc = new dijit.layout.BorderContainer(
           {id:"explorer_bc",
            title: "Explorer",
            style: "background-color: #efefef; border-style: none solid none none; border-color: #929292",
            splitter: "true"

           }).placeAt(accordion);
    
    var explorer_cpane = dijit.layout.ContentPane(
            {id : "explorer_cpane",
             region : "top",
             style : "overflow: scroll; background-color: #efefef; height: 90%;"}
        ).placeAt( explorer_bc.domNode );

    var store = new dojox.data.FileStore( 
                {id : "store",
                 url : "bin/filestore_dojotree.py",
                 pathAsQueryParam : "true"}     
             );
    
    var model = new dijit.tree.ForestStoreModel(
                     {id : "model",
                      store : store,
                      rootId : "projects",
                      rootLabel : "projects" }
                    );       

    
    var makeTree = function(){
        var tree = new dijit.Tree(
            {id : "tree",
             model : model,
             onClick :
                function(item){ 
                    var track_name = store.getValue(item, 'name');
                    var isVisualized = brwsr.view.isVisualized( track_name ); //f.length == 1;
                    if( isVisualized ){
                        visualize_button.set('label', 'Recall');
                        visualize_button.onClick = 
                            function(){ recall(track_name); }; 
                    }
                    else{
                        visualize_button.set('label', 'Visualize');
                        visualize_button.onClick = 
                            function(){ visualize(track_name); };
                    }   
                    var buttons = [view_query_button, delete_button,
                                   visualize_button, download_button];
                    if( store.getValue( item,'directory' ) ){
                        dojo.forEach( buttons, toggler("disabled",true) );
                    }
                    else{
                        dojo.forEach( buttons, toggler("disabled",false) );
                    }

                }
            })
        return tree;
    };

    var tree = makeTree();
    tree.placeAt( explorer_cpane.domNode ); 

    var refreshTree = function(){
        dijit.byId("tree").model.store.clearOnClose = true;
        dijit.byId("tree").model.store.close();
   
        dijit.byId("tree").model.constructor(dijit.byId("tree").model)

        dijit.byId("tree").destroyRecursive();
        tree =  makeTree();
        tree.placeAt( explorer_cpane.domNode );
    
    };

    var explorer_button_pane = dijit.layout.ContentPane(
            {id : "explorer_button_pane",
             region : "bottom",
             style : "background-color: #efefef; height: 10%;"}
        ).placeAt( explorer_bc.domNode );

    var download_button = new dijit.form.Button(
            {id: "download_button",
             label: "Download",
             style: "margin-top: 0px;",
             onClick: function(){
                        var query_name = tree.selectedItem.name; 
                        var url = "data/tracks/"+brwsr.refSeq.name+"/query_"+query_name+"/"+query_name+".bam";
                        window.location = url;
                      }
            }).placeAt( explorer_button_pane.domNode );

    var delete_button = new dijit.form.Button(
        {id: "delete_button", 
         label: "Delete", 
         style: "margin-top: 0px;",
         onClick: function(){ deleteSubmit(brwsr); }
        }).placeAt( explorer_button_pane.domNode );
   
    var deleteSubmit = function(brwsr) {

        //brwsr.chromList.options[brwsr.chromList.selectedIndex].value;
        var current_chrom = brwsr.refSeq.name;
        var deleted_item = tree.selectedItem;
        var delete_name = deleted_item.name;
        recall( tree.selectedItem.name );
        var tracks_in_trash = [delete_name];
        //what are we doing with ids_to_trash?
        var ids_to_trash = [];
        var ix = brwsr.tracks.indexOf(delete_name);
        if( ix != -1 ){
            brwsr.tracks.splice(ix,1);
        }
        var args = {chrom: current_chrom,
                    delete_track: tracks_in_trash};

        var url = "bin/remove_track.py?" + dojo.objectToQuery(args);

        var xhrArgs = {
            url: url,
            form: dojo.byId("track_manager_form"),
            handleAs: "text",
            load: function(data,ioargs) {
                //var tree = dijit.byId('tree');
                //if(tree){ tree.destroy(); }
                //var tree = 
                refreshTree();
                alert('Track deleted');
            },
            error: function(error) {
                dojo.byId("track_manager_status").innerHTML = "fail";
            }
        }
        //Call the asynchronous xhrPost
        var deferred = dojo.xhrPost(xhrArgs);
    };

   
    //onClick behavior controled by the tree 
    var visualize_button = new dijit.form.Button(
        {id: "visualize_button", 
         label: "Visualize", 
         style: "margin-top: 0px;"
        }).placeAt( explorer_button_pane.domNode );
    
    var visualize = function(track_name){
        var tester = function(item){
            return item["key"] == track_name;
        }
        var matches = dojo.filter( brwsr.trackData, tester );
        if( matches.length == 0 ){ alert(" no matches"); }
        else if( matches.length == 1 ){
           brwsr.viewDndWidget.insertNodes( false, [matches[0]] );
           brwsr.onVisibleTracksChanged();
        }
        else{ alert(" too many matches"); }
        visualize_button.set('label','Recall');
        visualize_button.onClick = function(){ recall(tree.selectedItem.name); };

    };

    var recall = function(track_name){
        var isVisualized = brwsr.view.isVisualized( track_name );
        //var c = dojo.byId( 'track_'+track_name );
        if( isVisualized ){
            brwsr.view.zoomContainer.removeChild( 
                dojo.byId( 'track_'+track_name )
            );
        }
        brwsr.onVisibleTracksChanged();
        visualize_button.set('label','Visualize');
        visualize_button.onClick = 
            function(){ visualize(tree.selectedItem.name); };

    };

    var view_query_button = new dijit.form.Button(
        {id: "view_query_button", 
         label: "View Text", 
         style: "margin-top: 0px;",
        //disabled: "true",
         onClick: function(){
             var host_chrom = brwsr.refSeq.name;
             var query_name = tree.selectedItem.name;
             var url = "data/tracks/"+host_chrom+"/query_"+query_name+"/"+query_name+".gq";
             dojo.xhrGet({
                 url: url,
                 handleAs: "text",
                 load: function(data,args){
                     alert(data);
                 },
                 error: function(data,args){
                    alert("trouble retrieving the generating query");
                 }
             });
        }
        }).placeAt( explorer_button_pane.domNode );

   
    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    //            Some Helper functions
    ///////////////////////////////////////////////////////////////////////////////////////////////////////// 

    var toggler = function( property, value ){
        return function(thing,i){
            thing.set(property,value);
        };
    };

    var trackkeyFromFilename = function( path ){
        //handily it will always appear as C:\fakepath\<filename>
        var splt = path.split('\\');
        var filename = splt[splt.length-1].split('.');
        var name = filename.slice(0, filename.length-1).join('.');
        return name;
    }

    //0 : OK
    //1 : malformed name
    //2 : duplicate name
    //3 : cannot find histogram file
    var hasNameConflict = function(name) {
        if( name == '' ){ 
            alert("Filename is empty");
            return 1; 
        }
        else{
            for( trackkey in brwsr.tracks ){
                if( name == brwsr.tracks[trackkey] ){
                    alert("There is already a track with that name");
                    return 2;
                 }
            }
        }
        return 0;
        //compared to ?? (other tracks)
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////
    //            GenomeView creator setup
    /////////////////////////////////////////////////////////////////////////////////////////////////////
   
    var initCallback = function( trackKey, tracksInterestingAreas ) {
        brwsr.interestingAreas.addTrack( trackKey, tracksInterestingAreas );
        brwsr.navigateTo(brwsr.locationBox.value);
    };
    var changeCallback = function() {
        brwsr.view.showVisibleBlocks(true);
    };

    var trackCreate = function(track, hint) {
        var node;
        if ("avatar" == hint) {
            alert("Dont' want to have to do return a trackListCreate here");
            //return trackListCreate(track, hint);
        } 
        else {
            var replaceData = {refseq: brwsr.refSeq.name};
            var url = track.url.replace(/\{([^}]+)\}/g, function(match, group) {return replaceData[group];});
            var klass = eval(track.type);
            var newTrack = new klass(track, url, brwsr.refSeq,
                                     {
                                         maxRender: brwsr.maxRender,
                                         //see FeatureTrack ctor for explanation
                                         initCallback: initCallback,
                                         //calls GenomeView showVisibleBlocks()
                                         changeCallback: changeCallback,
                                         trackPadding: brwsr.view.trackPadding,
                                         baseUrl: brwsr.dataRoot,
                                         charWidth: brwsr.view.charWidth,
                                         seqHeight: brwsr.view.seqHeight
                                     });
            node = brwsr.view.addTrack(newTrack);
            
        }
        return {node: node, data: track, type: ["track"]};
    };

    this.viewDndWidget = new dojo.dnd.Source(this.view.zoomContainer,
                                       {
                                           creator: trackCreate,
                                           accept: ["track"],
                                           withHandles: true
                                       });

    dojo.subscribe("/dnd/drop", function(source,nodes,iscopy){
                       brwsr.onVisibleTracksChanged();
                       //multi-select too confusing?
                       //brwsr.viewDndWidget.selectNone();
                   });

//this.trackListWidget.insertNodes(false, params.trackData);
    var oldTrackList = dojo.cookie(this.container.id + "-tracks");
    if (params.tracks) {
        this.showTracks(params.tracks);
    } else if (oldTrackList) {
        this.showTracks(oldTrackList);
    } else if (params.defaultTracks) {
        this.showTracks(params.defaultTracks);
    }

};


/**
 * @private
 */
Browser.prototype.onFineMove = function(startbp, endbp) {
    var length = this.view.ref.end - this.view.ref.start;
    var trapLeft = Math.round((((startbp - this.view.ref.start) / length)
                               * this.view.overviewBox.w) + this.view.overviewBox.l);
    var trapRight = Math.round((((endbp - this.view.ref.start) / length)
                                * this.view.overviewBox.w) + this.view.overviewBox.l);
    var locationTrapStyle;
    if (dojo.isIE) {
        //IE apparently doesn't like borders thicker than 1024px
        locationTrapStyle =
            "top: " + this.view.overviewBox.t + "px;"
            + "height: " + this.view.overviewBox.h + "px;"
            + "left: " + trapLeft + "px;"
            + "width: " + (trapRight - trapLeft) + "px;"
            + "border-width: 0px";
    } else {
        locationTrapStyle =
            "top: " + this.view.overviewBox.t + "px;"
            + "height: " + this.view.overviewBox.h + "px;"
            + "left: " + this.view.overviewBox.l + "px;"
            + "width: " + (trapRight - trapLeft) + "px;"
            + "border-width: " + "0px "
            + (this.view.overviewBox.w - trapRight) + "px "
            + this.view.locationTrapHeight + "px " + trapLeft + "px;";
    }

    this.locationTrap.style.cssText = locationTrapStyle;
};


/**
 * @private
 */
Browser.prototype.onVisibleTracksChanged = function() {
    this.view.updateTrackList();
    var trackLabels = dojo.map(this.view.tracks,
                               function(track) { return track.name; });
    dojo.cookie(this.container.id + "-tracks",
                trackLabels.join(","),
                {expires: 60});
    this.view.showVisibleBlocks();
};

/**
 * @private
 * add new tracks to the track list
 * @param trackList list of track information items
 * @param replace true if this list of tracks should replace any existing
 * tracks, false to merge with the existing list of tracks
 */

Browser.prototype.addTracks = function(trackList, replace) {
    if (!this.isInitialized) {
        var brwsr = this;
        this.deferredFunctions.push(
            function() {brwsr.addTracks(trackList, show); }
        );
	return;
    }

    this.tracks.concat(trackList);
    if (show || (show === undefined)) {
        this.showTracks(dojo.map(trackList,
                                 function(t) {return t.label;}).join(","));
    }
};

/**
 * navigate to a given location
 * @example
 * gb=dojo.byId("GenomeBrowser").genomeBrowser
 * gb.navigateTo("ctgA:100..200")
 * gb.navigateTo("f14")
 * @param loc can be either:<br>
 * &lt;chromosome&gt;:&lt;start&gt; .. &lt;end&gt;<br>
 * &lt;start&gt; .. &lt;end&gt;<br>
 * &lt;center base&gt;<br>
 * &lt;feature name/ID&gt;
 */
Browser.prototype.navigateTo = function(loc) {
    if (!this.isInitialized) {
        var brwsr = this;
        this.deferredFunctions.push(function() { brwsr.navigateTo(loc); });
	return;
    }

    loc = dojo.trim(loc);
    //                                (chromosome)    (    start      )   (  sep     )     (    end   )
    var matches = String(loc).match(/^(((\S*)\s*:)?\s*(-?[0-9,.]*[0-9])\s*(\.\.|-|\s+))?\s*(-?[0-9,.]+)$/i);
    //matches potentially contains location components:
    //matches[3] = chromosome (optional)
    //matches[4] = start base (optional)
    //matches[6] = end base (or center base, if it's the only one)
    if (matches) {
	if (matches[3]) {
	    var refName;
	    for (ref in this.allRefs) {
		if ((matches[3].toUpperCase() == ref.toUpperCase())
                    ||
                    ("CHR" + matches[3].toUpperCase() == ref.toUpperCase())
                    ||
                    (matches[3].toUpperCase() == "CHR" + ref.toUpperCase())) {

		    refName = ref;
                }
            }
	    if (refName) {
		dojo.cookie(this.container.id + "-refseq", refName, {expires: 60});
		if (refName == this.refSeq.name) {
		    //go to given start, end on current refSeq
		    this.view.setLocation(this.refSeq,
					  parseInt(matches[4].replace(/[,.]/g, "")),
					  parseInt(matches[6].replace(/[,.]/g, "")));
		} else {
		    //new refseq, record open tracks and re-open on new refseq
                    var curTracks = [];
                    this.viewDndWidget.forInItems(function(obj, id, map) {
                            curTracks.push(obj.data);
                        });

		    for (var i = 0; i < this.chromList.options.length; i++)
			if (this.chromList.options[i].text == refName)
			    this.chromList.selectedIndex = i;
		    this.refSeq = this.allRefs[refName];
		    //go to given refseq, start, end
		    this.view.setLocation(this.refSeq,
					  parseInt(matches[4].replace(/[,.]/g, "")),
					  parseInt(matches[6].replace(/[,.]/g, "")));

                    this.viewDndWidget.insertNodes(false, curTracks);
                    this.onVisibleTracksChanged();
		}
		return;
	    }
	} else if (matches[4]) {
	    //go to start, end on this refseq
	    this.view.setLocation(this.refSeq,
				  parseInt(matches[4].replace(/[,.]/g, "")),
				  parseInt(matches[6].replace(/[,.]/g, "")));
	    return;
	} else if (matches[6]) {
	    //center at given base
	    this.view.centerAtBase(parseInt(matches[6].replace(/[,.]/g, "")));
	    return;
	}
    }
    //if we get here, we didn't match any expected location format

    var brwsr = this;
    this.names.exactMatch(loc, function(nameMatches) {
	    var goingTo;
	    //first check for exact case match
	    for (var i = 0; i < nameMatches.length; i++) {
		if (nameMatches[i][1] == loc)
		    goingTo = nameMatches[i];
	    }
	    //if no exact case match, try a case-insentitive match
            if (!goingTo) {
                for (var i = 0; i < nameMatches.length; i++) {
                    if (nameMatches[i][1].toLowerCase() == loc.toLowerCase())
                        goingTo = nameMatches[i];
                }
            }
            //else just pick a match
	    if (!goingTo) goingTo = nameMatches[0];
	    var startbp = goingTo[3];
	    var endbp = goingTo[4];
	    var flank = Math.round((endbp - startbp) * .2);
	    //go to location, with some flanking region
	    brwsr.navigateTo(goingTo[2]
			     + ":" + (startbp - flank)
			     + ".." + (endbp + flank));
	    brwsr.showTracks(brwsr.names.extra[nameMatches[0][0]]);
	});
};

/**
 * load and display the given tracks
 * @example
 * gb=dojo.byId("GenomeBrowser").genomeBrowser
 * gb.showTracks("DNA,gene,mRNA,noncodingRNA")
 * @param trackNameList {String} comma-delimited string containing track names,
 * each of which should correspond to the "label" element of the track
 * information dictionaries
 */
Browser.prototype.showTracks = function(trackNameList) {
    if (!this.isInitialized) {
        var brwsr = this;
        this.deferredFunctions.push(
            function() { brwsr.showTracks(trackNameList); }
        );
    	return;
    }

    var trackNames = trackNameList.split(",");
    var removeFromList = [];
    var brwsr = this;
    for (var n = 0; n < trackNames.length; n++) {
        //this.trackListWidget.forInItems(function(obj, id, map) {
        var anon = function(entry,i) {
            if (trackNames[n] == entry.label) {
                brwsr.viewDndWidget.insertNodes(false, [entry]);
                removeFromList.push(i);
            }
        };
        dojo.forEach( brwsr.trackData, anon );
    }
    //var movedNode;
    //for (var i = 0; i < removeFromList.length; i++) {
    //this.trackListWidget.delItem(removeFromList[i]);
    //movedNode = dojo.byId(removeFromList[i]);
    //movedNode.parentNode.removeChild(movedNode);
    //}
    this.onVisibleTracksChanged();
};

/**
 * @returns {String} string representation of the current location<br>
 * (suitable for passing to navigateTo)
 */
Browser.prototype.visibleRegion = function() {
    return this.view.ref.name + ":" + Math.round(this.view.minVisible()) + ".." + Math.round(this.view.maxVisible());
};

/**
 * @returns {String} containing comma-separated list of currently-viewed tracks<br>
 * (suitable for passing to showTracks)
 */
Browser.prototype.visibleTracks = function() {
    var trackLabels = dojo.map(this.view.tracks,
                               function(track) { return track.name; });
    return trackLabels.join(",");
};

/**
 * @private
 */
Browser.prototype.onCoarseMove = function(startbp, endbp) {
    this.interestingAreas.updateViewFrame( startbp, endbp );
    var length = this.view.ref.end - this.view.ref.start;
    var trapLeft = Math.round((((startbp - this.view.ref.start) / length)
                               * this.view.overviewBox.w) + this.view.overviewBox.l);
    var trapRight = Math.round((((endbp - this.view.ref.start) / length)
                                * this.view.overviewBox.w) + this.view.overviewBox.l);

    this.view.locationThumb.style.cssText =
    "height: " + (this.view.overviewBox.h - 4) + "px; "
    + "left: " + trapLeft + "px; "
    + "width: " + (trapRight - trapLeft) + "px;"
    + "z-index: 20";

    //since this method gets triggered by the initial GenomeView.sizeInit,
    //we don't want to save whatever location we happen to start at
    if (! this.isInitialized) return;
    var locString = Util.addCommas(Math.round(startbp)) + " .. " + Util.addCommas(Math.round(endbp));
    this.locationBox.value = locString;
    this.goButton.disabled = true;
    this.locationBox.blur();
    var oldLocMap = dojo.fromJson(dojo.cookie(this.container.id + "-location"));
    if ((typeof oldLocMap) != "object") oldLocMap = {};
    oldLocMap[this.refSeq.name] = locString;
    dojo.cookie(this.container.id + "-location",
                dojo.toJson(oldLocMap),
                {expires: 60});

    document.title = this.refSeq.name + ":" + locString;
};

/**
 * @private
 */
Browser.prototype.createNavBox = function(parent, locLength, params) {
    var brwsr = this;
    var navbox = document.createElement("div");
    var browserRoot = params.browserRoot ? params.browserRoot : "";
    navbox.id = "navbox";
    parent.appendChild(navbox);
    navbox.style.cssText = "text-align: center; padding: 2px; z-index: 10;";

    if (params.bookmark) {
        this.link = document.createElement("a");
        this.link.appendChild(document.createTextNode("Link"));
        this.link.href = window.location.href;
        dojo.connect(this, "onCoarseMove", function() {
                         brwsr.link.href = params.bookmark(brwsr);
                     });
        dojo.connect(this, "onVisibleTracksChanged", function() {
                         brwsr.link.href = params.bookmark(brwsr);
                     });
        this.link.style.cssText = "float: right; clear";
        navbox.appendChild(this.link);
    }

    var getNewCenterClosure = function(arrow_direction){
        var callback = function(event){
            dojo.stopEvent(event);   
            var new_center = (arrow_direction=="left") ? 
                             brwsr.interestingAreas.getNextLeftSite( brwsr.view.minVisible(), brwsr.view.maxVisible() ) : 
                             brwsr.interestingAreas.getNextRightSite( brwsr.view.minVisible(), brwsr.view.maxVisible() );
            if( new_center >= 0 ){
                brwsr.view.centerAtBase( new_center );
            }
        }
        return callback;
    }

    var moveLeft = document.createElement("input");
    moveLeft.type = "image";
    moveLeft.src = browserRoot + "img/slide-left.png";
    moveLeft.id = "moveLeft";
    moveLeft.className = "icon nav";
    moveLeft.style.height = "40px";
    dojo.connect(moveLeft, "click", getNewCenterClosure("left") 
            /*function(event) {*/
            /*dojo.stopEvent(event);*/
            /*brwsr.view.slide(0.9);*/
            /*}*/
                );
    navbox.appendChild(moveLeft);

    var moveRight = document.createElement("input");
    moveRight.type = "image";
    moveRight.src = browserRoot + "img/slide-right.png";
    moveRight.id="moveRight";
    moveRight.className = "icon nav";
    moveRight.style.height = "40px";
    dojo.connect(moveRight, "click", getNewCenterClosure("right")
            /*function(event) {*/
            /*dojo.stopEvent(event);*/
            /*brwsr.view.slide(-0.9);*/
            /*}*/
                );
    navbox.appendChild(moveRight);

    navbox.appendChild(document.createTextNode("\u00a0\u00a0\u00a0\u00a0"));

    var bigZoomOut = document.createElement("input");
    bigZoomOut.type = "image";
    bigZoomOut.src = browserRoot + "img/zoom-out-2.png";
    bigZoomOut.id = "bigZoomOut";
    bigZoomOut.className = "icon nav";
    bigZoomOut.style.height = "40px";
    navbox.appendChild(bigZoomOut);
    dojo.connect(bigZoomOut, "click",
                 function(event) {
                     dojo.stopEvent(event);
                     brwsr.view.zoomOut(undefined, undefined, 2);
                 });

    var zoomOut = document.createElement("input");
    zoomOut.type = "image";
    zoomOut.src = browserRoot + "img/zoom-out-1.png";
    zoomOut.id = "zoomOut";
    zoomOut.className = "icon nav";
    zoomOut.style.height = "40px";
    dojo.connect(zoomOut, "click",
                 function(event) {
                     dojo.stopEvent(event);
                     brwsr.view.zoomOut();
                 });
    navbox.appendChild(zoomOut);

    var zoomIn = document.createElement("input");
    zoomIn.type = "image";
    zoomIn.src = browserRoot + "img/zoom-in-1.png";
    zoomIn.id = "zoomIn";
    zoomIn.className = "icon nav";
    zoomIn.style.height = "40px";
    dojo.connect(zoomIn, "click",
                 function(event) {
                     dojo.stopEvent(event);
                     brwsr.view.zoomIn();
                 });
    navbox.appendChild(zoomIn);

    var bigZoomIn = document.createElement("input");
    bigZoomIn.type = "image";
    bigZoomIn.src = browserRoot + "img/zoom-in-2.png";
    bigZoomIn.id = "bigZoomIn";
    bigZoomIn.className = "icon nav";
    bigZoomIn.style.height = "40px";
    dojo.connect(bigZoomIn, "click",
                 function(event) {
                     dojo.stopEvent(event);
                     brwsr.view.zoomIn(undefined, undefined, 2);
                 });
    navbox.appendChild(bigZoomIn);

    navbox.appendChild(document.createTextNode("\u00a0\u00a0\u00a0\u00a0"));
    this.chromList = document.createElement("select");
    this.chromList.id="chrom";
    navbox.appendChild(this.chromList);
    this.locationBox = document.createElement("input");
    this.locationBox.size=locLength;
    this.locationBox.type="text";
    this.locationBox.id="location";
    dojo.connect(this.locationBox, "keydown", function(event) {
            if (event.keyCode == dojo.keys.ENTER) {
                brwsr.navigateTo(brwsr.locationBox.value);
                //brwsr.locationBox.blur();
                brwsr.goButton.disabled = true;
                dojo.stopEvent(event);
            } else {
                brwsr.goButton.disabled = false;
            }
        });
    navbox.appendChild(this.locationBox);

    this.goButton = document.createElement("button");
    this.goButton.appendChild(document.createTextNode("Go"));
    this.goButton.disabled = true;
    dojo.connect(this.goButton, "click", function(event) {
            brwsr.navigateTo(brwsr.locationBox.value);
            //brwsr.locationBox.blur();
            brwsr.goButton.disabled = true;
            dojo.stopEvent(event);
        });
    navbox.appendChild(this.goButton);

    return navbox;
};

/*

Copyright (c) 2007-2009 The Evolutionary Software Foundation

Created by Mitchell Skinner <mitch_skinner@berkeley.edu>

This package and its accompanying libraries are free software; you can
redistribute it and/or modify it under the terms of the LGPL (either
version 2.1, or at your option, any later version) or the Artistic
License 2.0.  Refer to LICENSE for the full license text.

*/
