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

err_filename = "%s/make_new_project_error.txt" % (GlobalConfig.DEBUG_DIR)
sys.stderr = open( err_filename,'w')
out_filename = "%s/make_new_project_output.txt" % (GlobalConfig.DEBUG_DIR)
sys.stdout = open( out_filename,'w')

fields = cgi.FieldStorage()
project_name = fields.getvalue("project_name")

utils.printToServer( 'Content-type: text/json\n\n' )
try :
    project_dir = "%s/data/tracks/%s%s" % \
                   (GlobalConfig.ROOT_DIR, 
                    GlobalConfig.PROJECT_PREFIX, 
                    project_name) 

    os.mkdir( project_dir )
    os.mkdir( project_dir + "/interval_tables" )
    status = "ok"
    message = "good to go"
    print "made the directory"
except OSError as e :
    status = "error"
    message = "erk"
    print str(e)


utils.printToServer( '{"status":"%s", "message":"%s"}' % (status,message) )