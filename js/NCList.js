//After
//Alekseyenko, A., and Lee, C. (2007).
//Nested Containment List (NCList): A new algorithm for accelerating
//   interval query of genome alignment and interval databases.
//Bioinformatics, doi:10.1093/bioinformatics/btl647
//http://bioinformatics.oxfordjournals.org/cgi/content/abstract/btl647v1

function NCList() {
}

NCList.prototype.importExisting = function(nclist, sublistIndex,
                                           lazyIndex, baseURL,
                                           lazyUrlTemplate) {
    this.topList = nclist;
    this.sublistIndex = sublistIndex;
    this.lazyIndex = lazyIndex;
    this.baseURL = baseURL;
    this.lazyUrlTemplate = lazyUrlTemplate;
};

NCList.prototype.fill = function(intervals, sublistIndex) {
    //intervals: array of arrays of [start, end, ...]
    //sublistIndex: index into a [start, end] array for storing a sublist
    //              array. this is so you can use those arrays for something
    //              else, and keep the NCList bookkeeping from interfering.
    //              That's hacky, but keeping a separate copy of the intervals
    //              in the NCList seems like a waste (TODO: measure that waste).
    //half-open?
    this.sublistIndex = sublistIndex;
    var myIntervals = intervals;//.concat();
    //sort by OL
    myIntervals.sort(function(a, b) {
        if (a[0] != b[0])
            return a[0] - b[0];
        else
            return b[1] - a[1];
    });
    var sublistStack = new Array();
    var curList = new Array();
    this.topList = curList;
    curList.push(myIntervals[0]);
    var curInterval, topSublist;
    for (var i = 1, len = myIntervals.length; i < len; i++) {
        curInterval = myIntervals[i];
        //if this interval is contained in the previous interval,
        if (curInterval[1] < myIntervals[i - 1][1]) {
            //create a new sublist starting with this interval
            sublistStack.push(curList);
            curList = new Array(curInterval);
            myIntervals[i - 1][sublistIndex] = curList;
        } else {
            //find the right sublist for this interval
            while (true) {
                if (0 == sublistStack.length) {
                    curList.push(curInterval);
                    break;
                } else {
                    topSublist = sublistStack[sublistStack.length - 1];
                    if (topSublist[topSublist.length - 1][1] > curInterval[1]) {
                        //curList is the first (deepest) sublist that
                        //curInterval fits into
                        curList.push(curInterval);
                        break;
                    } else {
                        curList = sublistStack.pop();
                    }
                }
            }
        }
    }
};

NCList.prototype.binarySearch = function(arr, item, itemIndex) {
    var low = -1;
    var high = arr.length;
    var mid;

    while (high - low > 1) {
        mid = (low + high) >>> 1;
        if (arr[mid][itemIndex] > item)
            high = mid;
        else
            low = mid;
    }
    //if we're iterating rightward, return the high index;
    //if leftward, the low index
    if (1 == itemIndex) return high; else return low;
};

NCList.prototype.iterHelper = function(arr, from, to, fun, finish,
                                       inc, searchIndex, testIndex, path, maxRender) {

    //if( maxRender <= 0 ){ 
        //somehow need to construct a feature placed at the correct
        //coordinates so it appears directly below the last feature
        //OR
        //could we used (to,from) to achieve a big long feature
        //also need to figure out such a thing would be drawn
        //there was a dashed pattern somewhere, just used that?
        //chevron2.svg
        //but what when there is already one ending the block?
        //fun( [from,to,1,"forward"], ["dot","dot","dot"] );
        //return; 
        //}
    var keepIterating = true;
    var len = arr.length;
    var i = this.binarySearch(arr, from, searchIndex);
    var rendered = 0;
    while ((i < len) //&& keepIterating//&& rendered < maxRender
           && (i >= 0)
           && ((inc * arr[i][testIndex]) < (inc * to)) ) {

        if ("object" == typeof arr[i][this.lazyIndex]) {
            var ncl = this;
            // lazy node
            if (arr[i][this.lazyIndex].state) {
                if ("loading" == arr[i][this.lazyIndex].state) {
                    // node is currenly loading; finish this query once it
                    // has been loaded
                    finish.inc();
                    arr[i][this.lazyIndex].callbacks.push(
                        function(parentIndex) {
                            return function(o) {
                                ncl.iterHelper(o, from, to, fun, finish, inc,
                                               searchIndex, testIndex,
                                               path.concat(parentIndex), maxRender);
                                finish.dec();
                            };
                        }(i)
                    );
                } else if ("loaded" == arr[i][this.lazyIndex].state) {
                    // just continue below
                } else {
                    console.log("unknown lazy type: " + arr[i]);
                }
            } else {
                // no "state" property means this node hasn't been loaded,
                // start loading
                arr[i][this.lazyIndex].state = "loading";
                arr[i][this.lazyIndex].callbacks = [];
                finish.inc();
                dojo.xhrGet(
                    {
                        url: this.baseURL +
                            this.lazyUrlTemplate.replace(
                                /\{chunk\}/g,
                                arr[i][this.lazyIndex].chunk
                            ),
                        handleAs: "json",
                        load: function(lazyFeat, lazyObj, sublistIndex, parentIndex) {
                            return function(o) {
                                lazyObj.state = "loaded";
                                lazyFeat[sublistIndex] = o;
                                ncl.iterHelper(o, from, to,
                                               fun, finish, inc,
                                               searchIndex, testIndex,
                                               path.concat(parentIndex), maxRender);
                                for (var c = 0;
                                     c < lazyObj.callbacks.length;
                                     c++)
                                     lazyObj.callbacks[c](o);
                                finish.dec();
                            };
                        }(arr[i], arr[i][this.lazyIndex], this.sublistIndex, i),
                        error: function() {
                            finish.dec();
                        }
                    });
            }
        } else {
            keepIterating = fun(arr[i], path.concat(i), maxRender);
            rendered += 1;
            //keepIterating = true;
        }


        //We are given a display depth of D.  To give the best picture of read situation,
        //we should display as much of the top level NCList as possible.
        //Overlapping features nested in the same NCList will use +1 display level for
        //each overlap (current left  <= previous right)
        //If D - overlap_count > 0, we can move onto  
        //
        //logical depth vs display depth
        //always visualize across logical depth before following any sublist pointers
        //questions is, where do we hold the chunk information until the user decides
        //they want to see more?  In memory?  This seems like too much to ask the 
        //browser, (also what would happen in histogram mode?)  Or do we discard, wait
        //for requests, resend the chunk, add in new stuff (this seemed to work well
        //currently).  Or could chuck it entirely and create a fine grained request
        //mechanism, where we track the unvisualized frontier and make targeted requests
        // lets go with option 2, it seems that most of the time the user will be satisfied
        // with what comes out the first time (display depth 50 get rendered no problems)
        // , and this is easist to implement

        if (keepIterating) {
            if (arr[i][this.sublistIndex] ){
                this.iterHelper(arr[i][this.sublistIndex], from, to,
                                fun, finish, inc, searchIndex, testIndex,
                                path.concat(i), maxRender-1);
            }
        }
        else{
            var a = 5;
        }
        i += inc;
    }
};

NCList.prototype.iterate = function(from, to, fun, postFun, maxRender) {
    // calls the given function once for each of the
    // intervals that overlap the given interval
    //if from <= to, iterates left-to-right, otherwise iterates right-to-left

    //inc: iterate leftward or rightward
    var inc = (from > to) ? -1 : 1;
    //searchIndex: search on start or end
    var searchIndex = (from > to) ? 0 : 1;
    //testIndex: test on start or end
    var testIndex = (from > to) ? 1 : 0;
    var finish = new Finisher(postFun);
    this.iterHelper(this.topList, from, to, fun, finish,
                    inc, searchIndex, testIndex, [], maxRender);
    finish.finish();
};

NCList.prototype.histogram = function(from, to, numBins, callback) {
    //calls callback with a histogram of the feature density
    //in the given interval

    var result = new Array(numBins);
    var binWidth = (to - from) / numBins;
    for (var i = 0; i < numBins; i++) result[i] = 0;
    //this.histHelper(this.topList, from, to, result, numBins, (to - from) / numBins);
    this.iterate(from, to,
                 function(feat) {
	             var firstBin =
                         Math.max(0, ((feat[0] - from) / binWidth) | 0);
                     var lastBin =
                         Math.min(numBins, ((feat[1] - from) / binWidth) | 0);
	             for (var bin = firstBin; bin <= lastBin; bin++)
                         result[bin]++;
                 },
                 function() {
                     callback(result);
                 }
                 );
};

/*

Copyright (c) 2007-2009 The Evolutionary Software Foundation

Created by Mitchell Skinner <mitch_skinner@berkeley.edu>

This package and its accompanying libraries are free software; you can
redistribute it and/or modify it under the terms of the LGPL (either
version 2.1, or at your option, any later version) or the Artistic
License 2.0.  Refer to LICENSE for the full license text.

*/
