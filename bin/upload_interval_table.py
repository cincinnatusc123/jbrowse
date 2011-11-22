#!/usr/bin/python
import cgi
import simplejson as json
import os
import os.path
import shutil
import sys
sys.path.append("../lib")
import GlobalConfig
import utils
import time
from subprocess import Popen, PIPE

err_filename = "%s/upload_error.txt" % (GlobalConfig.DEBUG_DIR)
sys.stderr = open( err_filename,'w')
out_filename = "%s/upload_output.txt" % (GlobalConfig.DEBUG_DIR)
sys.stdout = open( out_filename,'w')

fields = cgi.FieldStorage()

utils.printToServer( 'Content-type: text/html\n\n' )

#TODO: ownership and permission for inteval files
def validate( some_stuff ) :
    #how to check permissions to 
    return (True,"good to go")

fileitem = fields["interval_table"]
if fileitem.filename :
    handle = fileitem.file
    stuff = handle.read()
    (ok,message) = validate(stuff)
    if not ok :
        json_data = "{'status':'ERROR', 'message':'%s'}" % message
    else :
        fn = os.path.basename(fileitem.filename)
        path = "%s/genomequery/biosql_compiler/biosql" % GlobalConfig.ROOT_DIR
        newfilename = "%s/dst/%s" % (path,fn)
        open(newfilename, 'w').write( stuff )
        #update tables.txt, rebuild parsed tables

        ftables = "%s/tables.txt" % path
        ftables = open( ftables, 'a' )
        (name,ext) = os.path.splitext(fn)
        schema = "table %s (string annot_id, string chr, char ornt, integer begin, integer end);\n" % name
        ftables.write( schema )
        ftables.close()

        pop = Popen(['bash','rebuild_parsed_tables.sh'], \
                    stdin=PIPE, stdout=PIPE, stderr=PIPE)
        (out, err) = pop.communicate()
        sys.stderr.write(err)
        sys.stdout.write(out)

        #check err here?

        json_data = "{'status':'OK','message':'Uploaded!'}"
else :
    json_data = "{'status':'ERROR','message':'Uploading went awry'}"

utils.printPayload( json_data );
