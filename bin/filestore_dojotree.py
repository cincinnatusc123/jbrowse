#!/usr/bin/python
import sys
import os
import simplejson as json
import re
import cgi
import cgitb
import utils
cgitb.enable()

jconfig = fileToJson( "../lib/GlobalConfig.js" )
root_dir = jconfig["root_dir"]

output = "%s/bin/debugging" % root_dir
fout = open("%s/filestore_out.txt" % output,'w')
ferr = open("%s/filestore_err.txt" % output,'w')

def printToServer( s ) :
    sys.stdout = sys.__stdout__
    print s
    sys.stdout = fout

def getChildren( path ) :
    r = []
    for thing in os.listdir( path ) :
        splt = thing.rsplit('.',1)
        if len(splt) == 1 or not splt[1] == 'json' :
            r.append( thing )
    r.sort()
    print "\n\nGET CHILDREN", r
    return r

def handleQuery( path ) :
    print 'handale query: %s' % path
    total = 0
    items = []
    print "what"
    things = os.listdir( path )
    print "hey"
    things = sorted( things, key=utils.chromKeyer )
    print "you"
    for thing in things :
        total += 1
        fullpath = "%s/%s" % (path,thing)
        item = makeItem( fullpath )
        if item :
            print item
            items.append( item )
    print "asdfasdfasdfasdfadsf"
    jresponse = {'total' : total, 'items' : items}
    response = json.dumps( jresponse )
    print response
    printToServer( response )

def handlePath( path ) :
    item = makeItem( path )
    printToServer( json.dumps( item ) )

def makeItem( path ) :
    print 'making item: %s' % path
    (parent,name) = path.rsplit('/',1)
    print parent,name
    is_dir = os.path.isdir(path)
    if not is_dir :
        print "not dir"
        (f,ext) = name.rsplit('.',1)
        if ext == "json" : return {}
    item = {'name' : name, \
            'parentDir' : parent, \
            'size' : 1234, \
            'directory' : is_dir, \
            'path' : path }
    if is_dir :
        item["children"] = getChildren( path )
    return item

printToServer( "Content-type: text/json\n\n" )

projects_root = "%s/data/tracks" % root_dir

sys.stderr = ferr
sys.stdout = fout

dparams = cgi.parse()
print dparams
if 'path' in dparams :
    print 'handel path:', dparams['path'][0]
    handlePath( dparams['path'][0] )
else :
    handleQuery( projects_root )

fout.close()
ferr.close()

#print os.environ['REQUEST_URI']
#keys = ["query","queryOptions","start","count"]
#(query,queryOptions,start,count) = values

#{
  #"total": 2496,
  #"items": [
     #{"name": "foo0.txt", "parentDir": "some/dir0", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir0/foo.txt"},
     #{"name": "foo1.txt", "parentDir": "some/dir1", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir1/foo1.txt"},
     #{"name": "foo2.txt", "parentDir": "some/dir2", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir2/foo2.txt"},
     #{"name": "foo3.txt", "parentDir": "some/dir3", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir3/foo3.txt"},
   #{"name": "foo4.txt", "parentDir": "some/dir4", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir4/foo4.txt"},
     #{"name": "foo5.txt", "parentDir": "some/dir5", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir5/foo5.txt"},
     #{"name": "foo6.txt", "parentDir": "some/dir6", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir6/foo6.txt"},
     #{"name": "foo7.txt", "parentDir": "some/dir7", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir7/foo7.txt"},
     #{"name": "foofiles.txt", "parentDir": "some/dir8", "size": 1234, "modified": 1234567, "directory": true, "path": "some/dir8/foofiles.txt", "children": ["tmp1","tmp2","tmp3"]},
     #{"name": "foo9.txt", "parentDir": "some/dir9", "size": 1234, "modified": 1234567, "directory": false, "path": "some/dir9/foo9.txt"},
  #]
#}
#
#
###
