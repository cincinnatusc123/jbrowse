from string import split, atoi
from sys import exit
from copy import copy, deepcopy
import sys

class Command:
	def __init__(self, dep_graph, src, dst, cmd_type, line_st, line_nd):
		self.dep_graph=dep_graph #the dependency graph
		self.src=src #the source prefix
		self.dst=dst #the destination prefix
		self.cmd_type=cmd_type #mates vs single_coverage vs single_reads
		self.line_st=line_st #first line of the command
		self.line_nd=line_nd #last line of the command
		self.limit=0 #used for clone/read lime
		self.direction="<" #used to decide between upper/lower limit

def ioerror(msg):
	print >>sys.stderr, msg
	exit(1)

def open_file(fname):
	try:
		f=open(fname)
	except:
		ioerror("cannot open file "+fname)
	return f

#g is a dependency graph. It adds an edge from st_node (string) to each of 
#the vertixes of the list nd_nodes.
def update_dependency_graph(g, st_node, nd_nodes):
	if st_node not in g:
		g[st_node]=[]
	for n in nd_nodes:
		if n not in g: #if the node has not been encountered so far
			g[n]=[]
		if n not in g[st_node]:
			g[st_node].append(n)
	return

#if there is at least one mate variable, we are talking about mate pair mode.
#Otherwise we have a single mode
def mate_vs_single(g):
	for vrt in g:
		if vrt.count("mate_",0)>0:
			return "mate"
	return "single"

#it translates several words into proper c representation
def translate(word):
	if word=="length":
		return "indx[i].read_len"
	elif word=="location":
		return "indx[i].loc"
	elif word=="strand":
		return "get_strand(strand_indx, strand_len, i)"
	elif word=="mate_loc":
		return "indx[mate_indx].loc"
	elif word=="mate_length":
		return "indx[mate_indx].read_len"
	

#if there is a path from vrtx to dest it returns True. Otherwise False
def check_dependency(g, vrtx, dest):
	if g[vrtx]==[]:
		return False
	if g[vrtx].count(dest)>1:
		return True
	for t in g[vrtx]:
		if check_dependency(g, t, dest):
			return True
	return False

#it produces isvalid.c. g is the dependency graph. 
#Codelines are the set of the lines of the compiler 
#bytecode code. The lines that need to be used by the function are between
#code_st and code_nd
def produce_is_valid_mates(g, dest_fname, codelines, code_st, code_nd):
	outfp=open(dest_fname, w)
	print >> outfp,"#include<stdio.h>\n#include\"all_tools.h\""
	print >> outfp,"inline int is_valid(Mates *indx, int i, long *strand_indx, int strand_len){"
	print >> outfp, "\tint mate_indx=indx[i].mate_indx;"
	ret_str="\treturn 1;"
	for i in range(code_st, code_nd):
		line=codelines[i]
		sp_line=line.split(" ")
		for word in sp_line:
			if word==sp_line[0]:
				continue
			if check_dependency(g, word, "countvec")
				break
		else: #add the line in isvalid.c
			print >> outfp, "int %s;"%(sp_line[1])
			str=sp_line[1]+" "+sp_line[2]+" "
			ret_str="return ",sp_line[1],";"
			for j in range(3, len(sp_line)):
				str+=translate(sp_line[j])
			print >> outfp, "\t",str,";"
	print ret_str
	print "}"


#it get the type of that entry of the list whose dest_prefx is s
def get_earlier_cmd_type(lst, s):
	for l in lst:
		if l.dest_prefx==s:
			return l.cmd_type
	ioerror("Cannot find matching cmd_type")


#it returns a list of commands
def parse_coommands(lines):
	ret=[]
	g={} #the dependency graph of each command
	cmd_st=0
	src_prefx='in'
	limit=0
	direction=">"
	for i in range(len(lines)):
		sp_line=lines[i].split(" ")
		if sp_line[1]=="Input":
			if sp_line[3]!="READS":
				if src_prefx=='in':
					src_prefx=sp_line[3]
				else:
					ioerror "Cannot handle multiple sources at this point"
			cmd_st=i+1 #the first code line of the form t0=loc<1000
		elif sp_line[1]=="result_table" or i==len(lines)-1:
			cmd_nd=i
			if sp_line[1]=="result":
				dest_prefx=sp_line[3]
			else:
				dest_prefx="out"
			cmd=command(deepcopy(g), src_prefx, dest_prefx, cmd_type, cmd_st, cmd_nd)
			ret.append(cmd)
			g=[]
		elif sp_line[1]=="return_arg": #decide the type of the command
			if mate_vs_single(g)=="mate":
				if sp_line[3]!="strength_vector":
					cmd_type="mate"
				else:
					ioerror("Can't understand the mate command")
			elif sp_line[3]=="strength_vector":
				cmd_type="single_coverage"
			elif src_prefx!="in":
				cmd_type=get_earlier_cmd_type(ret, src_prefx)##same cmd type as the one that produced the products of src_prefx
			else:
				cmd_type="single_range"
		else: #sth like t0=t1<23
			st_node=sp_line[1]
			nd_nodes=[]
			if not sp_line[3].isdigit()
				nd_nodes.append(sp_line[3])
			if not sp_line[5].isdigit()
				nd_nodes.append(sp_line[5])
			update_dependency_graph(g, st_node, nd_nodes)
			if sp_line[3]==countvec:
				limit=atoi(sp_line[5])
				direction=sp_line[4][0] #for now treat the same >=,> and <=,<

	return ret


			


def main(argv=sys.argv):
	f=open_file(byte_code_file)
	lines=f.readlines()
	cmds=parse_commands(lines)
	bam_file="NA18507/chr1.bam"
	indx_file="NA18507/chr1.bam.mates.indx"
	chr_name="chr1"
	chromo_length="250000000"
	for cmd in cmds:
		if cmd.cmd_type=="mates"
			target_valid=cmd.dst+"isvalid.c"
			if cmd.dest_prefx=="out" and cmd.src_prefx!="in":
				mode=3
			elif cmd.dest_prefx!="out" and cmd.src_prefx=="in":
				mode=4
			else:
				"mates case currently not supported"
			print "./all_tools mates %s %s %d %s %d %s %s %d"%(bam_file, indx_file, chromo_length, chr_name, mode, cmd.src_prefx, cmd.dst_prefx, cmd.limit)
		elif cmd.cmd_type=="single_coverage":
			if cmd.direction==">":
				up_low="low"
			else:
				up_low="up"
			if cmd.dest_prefx=="out" and cmd.src_prefx!="in":
				mode=3
			elif cmd.dest_prefx!="out" and cmd.src_prefx=="in":
				mode=4
			else:
				"mates case currently not supported"
			target_valid=cmd_dst+"isvalid_single.c"
			print "./all_tools single_coverage %s %s %s %d %s %s %d %s %s"%(up_low, bam_file, indx_file, cmd.limit, chromo_length, chr_name, mode, cmd.src_prefx, cmd.dst_prefx)
		else:
			ioerror("single read range currently not supported...need to work on efficiency")
		
		produce_is_valid(cmd.dep_graph, target_valid, lines, cmd.line_st, cmd.line_nd)
	f.close()

if __name__==__main__:
	main()









	