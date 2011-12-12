%{
#include<stdlib.h>
#include<stdio.h>
#include<string.h>
#include"biosql_defs.h"
#define MAX_FROM_TABLES 2048

extern int lineNo;
extern int errorNo;
st_node *cur_owner=NULL;
st_node *lst=NULL; //the symbol table
st_node **from_lst=NULL;//(st_node**)malloc(sizeof(st_node*)*(MAX_FROM_TABLES+1));
int len_from_lst=0;
st_node *select_lst=NULL;
st_node *where_lst=NULL;

st_node *emit_lst=NULL;
int nextstat=1; //keep count of the lines of 

char *parsed_table_file;

%}

%union{
	int int_val;
	char *string;
	struct st_node *entry;
}

%token  CONST_CHAR
%token  CONST_STRING
%token  NUMBER
%token  EQUAL
%token  ASSIGN
%token  STAR
%token  GREATER
%token  LESS
%token  NOT_EQUAL
%token  LESS_EQUAL
%token  GREATER_EQUAL
%token  MUL
%token  DIV
%token  MOD
%token  PLUS
%token  MINUS
%token  AND
%token  OR
%token  NOT
%token  SEMICOLON
%token  DOT
%token  LPAREN
%token  RPAREN
%token  COMMA
%token  INTEGER
%token  FLOAT
%token  CHAR
%token  STRING_TYPE
%token  ID
%token  SELECT
%token  FROM
%token  WHERE
%token  COUNT
%token  TABLE
%token  MAPJOIN
%token	IMPORT
%token	USE
%token  USING
%token	INTERVAL_CREATION
%token  INTERVALS
%token	BOTH_MATES

%type <string> names
%type <entry> obj_names
%type <entry> table_keyword
%type <entry> table_arg
%type <entry> from_arg
%type <entry> lvalue
%type <entry> rvalue
%type <string> comparison_op
%type <string> lowest_expr
%type <string> where_args
%type <entry> arith_expr
%type <string> arith_op


%nonassoc	ID
%right	ASSIGN
%left	OR
%left	AND
%nonassoc	EQUAL GREATER LESS LESS_EQUAL GREATER_EQUAL NOT_EQUAL
%left	PLUS MINUS
%nonassoc	NOT
%left	TK_POSITIVE_SIGN TK_NEGATIVE_SIGN
%nonassoc	TK_LEFT_BRACKET TK_RIGHT_BRACKET TK_LEFT_SQUARE_BRACKET TK_RIGHT_SQUARE_BRACKET



%%
program: table_source import_tables assigned_selects select_statement
|
table_prototypes
;

table_prototypes: table_prototype table_prototypes
|
;

table_prototype: table_keyword LPAREN table_args RPAREN SEMICOLON{cur_owner=NULL;
	//if(strcmp($1->name, "READS")!=0){
		emit(&emit_lst, "end_load_table", NULL, NULL, NULL,NULL);
	//}
}
;

table_keyword: TABLE names{
	if(lookup(lst, $2, NULL, NULL, NULL)==NULL){
		$$=create_node($2, "table", "table", NULL);
		cur_owner=$$;
		add_node(&lst, $$);
		//if(strcmp($2, "READS")!=0){
			emit(&emit_lst, "load_table", $$->name, NULL, NULL,NULL);
		//}
	}
	else symerror("Conflict with name tables", $2);
}
	
;

names: ID{
	$$=(char*)malloc(strlen(yylval.string)+3);
	strcpy($$, yylval.string);
}
;

table_args: table_args COMMA table_arg {
//arguments need to appear in output in the order that the user enders them.

	//if(strcmp(cur_owner->name, "READS")!=0){
		if(strcmp($3->type,"integer")==0)
			emit(&emit_lst, "loaded_param", "int", $3->name, NULL,NULL);
		else if(strcmp($3->type,"string")==0)
			emit(&emit_lst, "loaded_param", "char*", $3->name, NULL,NULL);
		else
			emit(&emit_lst, "loaded_param", $3->type, $3->name, NULL,NULL);
	//}
	//free(tmp_str);
}

|table_arg{
	//if(strcmp(cur_owner->name, "READS")!=0){
		if(strcmp($1->type,"integer")==0)
			emit(&emit_lst, "loaded_param", "int", $1->name, NULL,NULL);
		else if(strcmp($1->type,"string")==0)
			emit(&emit_lst, "loaded_param", "char*", $1->name, NULL,NULL);
		else
			emit(&emit_lst, "loaded_param", $1->type, $1->name, NULL,NULL);
	//}
}
;

table_arg: INTEGER names{
	$$=check_and_create(lst, $2, "integer", "attribute", cur_owner);
	if($$!=NULL) add_node(&lst, $$);
	else symerror("Conflicting attribute names", $2);
	}
|FLOAT names{
	$$=check_and_create(lst, $2, "float", "attribute", cur_owner);
	if($$!=NULL) add_node(&lst, $$);
	else symerror("Conflicting attribute names", $2);
	}
|CHAR names{
	$$=check_and_create(lst, $2, "char", "attribute", cur_owner);
	if($$!=NULL) add_node(&lst, $$);
	else symerror("Conflicting attribute names", $2);
	}
|STRING_TYPE names{
	$$=check_and_create(lst, $2, "string", "attribute", cur_owner);
	if($$!=NULL) add_node(&lst, $$);
	else symerror("Conflicting attribute names", $2);
	}
		
;


table_source: USE names{
	//parsed_table_file=(char*)malloc(strlen(yylval.string)+3);
	//strcpy(parsed_table_file, yylval.string);
	parsed_table_file=strdup($2);
}

import_tables: import_tables import_tables
|IMPORT names SEMICOLON{
	load_table(&lst, &emit_lst, parsed_table_file, $2);
}
;

assigned_selects: assigned_select assigned_selects
|
;

assigned_select: lvalue ASSIGN select_statement{emit(&emit_lst, "result_table", ":", $1->name, NULL,NULL); cur_owner=NULL;}
;

lvalue: names{
	$$=check_and_create(lst, $1, "table", "table", NULL);
	check_for_symerror($$, "assigned table already exists", $1);
	add_node(&lst, $$);
	cur_owner=$$;
}
;

select_statement: SELECT select_args FROM compound_from_arg WHERE where_args{
	emit(&emit_lst, "end_filtering_code",NULL, NULL, NULL, NULL);
	if(1/*cur_owner != NULL*/){ //indication of assigned select...need to update the symbol table.
		if(select_lst->name[0]=='*'){
			replicate_args(from_lst, len_from_lst, &lst, cur_owner); //All properties of the tables in from_args are replicated under a new owner.
			emit(&emit_lst, "return_arg",":", "*",NULL, NULL);
		}
		else if(strcmp(select_lst->name, "interval_coverage")==0){
			add_node(&lst, create_node("interval_coverage", "integer", "attribute", cur_owner));
			emit(&emit_lst, "return_arg",":","strength_vector",NULL, NULL);
		}
		else{
			check_and_copy_from_mult(&lst, select_lst, from_lst, len_from_lst, cur_owner);
			st_node *tmp;
			for(tmp=select_lst;tmp!=NULL;tmp=tmp->next){
				tmp->place=malloc(2048);
				sprintf(tmp->place, "%s.%s",tmp->owner->name, tmp->name);
				emit(&emit_lst, "return_arg",":",tmp->place,NULL, NULL);
			}
		}
		
	}
	len_from_lst=0;
	where_lst=NULL;
	destroy_list(select_lst);
	select_lst=NULL;

}
| SELECT select_args FROM compound_from_arg{
	emit(&emit_lst, "N/A",NULL, NULL, NULL, NULL);
	emit(&emit_lst, "end_filtering_code",NULL, NULL, NULL, NULL);
	if(1/*cur_owner != NULL*/){ //indication of assigned select...need to update the symbol table.
		if(select_lst->name[0]=='*'){
			replicate_args(from_lst, len_from_lst, &lst, cur_owner); //All properties of the tables in from_args are replicated under a new owner.
			emit(&emit_lst, "return_arg",":", "*",NULL, NULL);
		}
		else if(strcmp(select_lst->name, "interval_coverage")==0){
			add_node(&lst, create_node("interval_coverage", "integer", "attribute", cur_owner));
			emit(&emit_lst, "return_arg",":","strength_vector",NULL, NULL);
		}
		else{
			check_and_copy_from_mult(&lst, select_lst, from_lst, len_from_lst, cur_owner);
			st_node *tmp;
			for(tmp=select_lst;tmp!=NULL;tmp=tmp->next){
				tmp->place=malloc(2048);
				sprintf(tmp->place, "%s.%s",tmp->owner->name, tmp->name);
				emit(&emit_lst, "return_arg",":",tmp->place,NULL, NULL);
			}
		}
		
	}
	len_from_lst=0;
	where_lst=NULL;
	destroy_list(select_lst);
	select_lst=NULL;
}
| SELECT select_args FROM MAPJOIN from_args{
	emit(&emit_lst, "N/A",NULL, NULL, NULL, NULL);
	emit(&emit_lst, "end_filtering_code",NULL, NULL, NULL, NULL);
	//squeeze_node(emit_lst, "Input", "begin_intersect"); //add a flag to help with code generation

	emit(&emit_lst, "mapjoin",NULL, NULL,NULL, NULL);
	if(select_lst->name[0]=='*'){
		replicate_args(from_lst, len_from_lst, &lst, cur_owner); //All properties of the tables in from_args are replicated under a new owner.
		///////////////emit(&emit_lst, "return_arg",":", "*",NULL, NULL);
	}
	else if(strcmp(select_lst->name, "interval_coverage")==0){
		add_node(&lst, create_node("interval_coverage", "integer", "attribute", cur_owner));
		emit(&emit_lst, "return_arg",":","strength_vector",NULL, NULL);
	}
	else{
		check_and_copy_from_mult(&lst, select_lst, from_lst, len_from_lst, cur_owner);
		st_node *tmp;
		for(tmp=select_lst;tmp!=NULL;tmp=tmp->next){
			tmp->place=malloc(2048);
			sprintf(tmp->place, "%s.%s",tmp->owner->name, tmp->name);
			emit(&emit_lst, "return_arg",":",tmp->place,NULL, NULL);
		}
	}

	len_from_lst=0;
	where_lst=NULL;
	destroy_list(select_lst);
	select_lst=NULL;

}
;

select_args: STAR{
	add_node(&select_lst, create_node("*",NULL, NULL, NULL));

}
| INTERVAL_CREATION LPAREN RPAREN{
	add_node(&select_lst, create_node("interval_coverage", NULL, NULL, NULL));
}
| select_arg_series

select_arg_series: names COMMA select_arg_series{
	//printf("@@adding %s\n",$1);
	add_node(&select_lst, create_node($1, NULL, NULL, NULL)); //remembers which names have been encountered by select
}
| names{
	//printf("@@adding %s\n",$1);
	add_node(&select_lst, create_node($1, NULL, NULL, NULL)); //remembers which names have been encountered by select
}
| obj_names{
	add_node(&select_lst, create_node($1->name, NULL, NULL, $1->owner));
}
;

from_args: compound_from_arg COMMA from_args
| compound_from_arg
;

compound_from_arg: from_arg{
	emit(&emit_lst, "N/A", NULL, NULL, NULL, NULL);
	emit(&emit_lst, "end_interval_spec",NULL, NULL, NULL, NULL);
	emit(&emit_lst, "begin_filtering_code",NULL, NULL, NULL, NULL);
}
/*| from_arg LPAREN arith_expr COMMA arith_expr RPAREN{*/
| from_arg USING INTERVALS LPAREN arith_expr COMMA arith_expr RPAREN{

	emit(&emit_lst, $1->name, "start", "=", $5->place, NULL);
	emit(&emit_lst, $1->name, "end", "=", $7->place, NULL);
	emit(&emit_lst, "end_interval_spec",NULL, NULL, NULL, NULL);
	emit(&emit_lst, "begin_filtering_code",NULL, NULL, NULL, NULL);
}
/*| from_arg MATES LPAREN arith_expr COMMA arith_expr RPAREN{*/
| from_arg USING INTERVALS LPAREN arith_expr COMMA arith_expr COMMA BOTH_MATES RPAREN{
	emit(&emit_lst, $1->name, "mate_en", "=", "1", NULL);
	emit(&emit_lst, $1->name, "start", "=", $5->place, NULL);
	emit(&emit_lst, $1->name, "end", "=", $7->place, NULL);
	emit(&emit_lst, "end_interval_spec",NULL, NULL, NULL, NULL);
	emit(&emit_lst, "begin_filtering_code",NULL, NULL, NULL, NULL);

}

;

from_arg: names{
	$$=lookup(lst, $1, "table", "table", NULL);
	//st_node *tmp;
	//for (tmp=lst;tmp!=NULL;tmp=tmp->next) printf("name: %s type: %s kind: %s owner: %x\n",tmp->name, tmp->type, tmp->kind, tmp->owner);
	check_for_symerror($$, "Unknown table in the FROM statement", $1);
	add_node_to_array(from_lst, &len_from_lst, $$);
	if(len_from_lst>1){ //close the "filtering_code from previous from stmt
		emit(&emit_lst, "N/A",NULL, NULL, NULL, NULL);
		emit(&emit_lst, "end_filtering_code",NULL, NULL, NULL, NULL);
	}
	emit(&emit_lst, "Input","=",$$->name,NULL, NULL);
	emit(&emit_lst, "begin_interval_spec",NULL, NULL, NULL, NULL);
}
;

where_args: where_args COMMA where_args { //the type of where_args is str and denotes the respective temporary variable
	$$=get_newtemp();
	emit(&emit_lst, $$,"=",$1, "&&", $3);
}
|where_args AND where_args{
$$=get_newtemp();
	emit(&emit_lst, $$,"=",$1, "&&", $3);
}
|where_args OR where_args{
	$$=get_newtemp();
	emit(&emit_lst, $$,"=",$1, "||", $3);
}
|NOT where_args{
	$$=get_newtemp();
	emit(&emit_lst, $$,"=","!",$2, NULL);
}
|LPAREN where_args RPAREN{
	$$=strdup($2);
	//emit(&emit_lst, $$,"=",$1.place, NULL, NULL);
}
|lowest_expr{
	$$=strdup($1);
}
;


lowest_expr: arith_expr comparison_op rvalue{

	if (strcmp($1->type, $3->type)!=0) symerror("Incompatible types in a where expression", $1->name);

	char *tmp_str1=(char*)malloc(1024);
	char *tmp_str2=(char*)malloc(1024);
	
	if (strcmp($1->type, "string")!=0){
		sprintf(tmp_str1,"%s %s %s",$1->place,$2,$3->name);
		sprintf(tmp_str2,"%d",nextstat+3);
	}
	else{
		if(strcmp($2,"==")==0)
			sprintf(tmp_str1, "(strcmp( %s , %s )==0)", $1->place, $3->name);
		else if(strcmp($2,"!=")==0)
			sprintf(tmp_str1, "(strcmp( %s , %s )!=0)", $1->place, $3->name);
		else if($2[0]=='>')
			sprintf(tmp_str1, "(strcmp( %s , %s )>0)", $1->place, $3->name);
		else 
			sprintf(tmp_str1, "(strcmp( %s , %s )<0)", $1->place, $3->name);
	}


	

	$$=get_newtemp();
	/*emit(&emit_lst, "if", tmp_str1, "goto",tmp_str2,NULL);//original impl
	emit(&emit_lst, $$,"=","0",NULL, NULL);*/
	emit(&emit_lst, $$, "=", tmp_str1,NULL, NULL);
	/*sprintf(tmp_str2,"%d",nextstat+2);
	emit(&emit_lst, "goto", tmp_str2,NULL, NULL, NULL);
	emit(&emit_lst, $$,"=","1",NULL,NULL);*/

	free(tmp_str1);
	free(tmp_str2);

}
|arith_expr comparison_op arith_expr{

	if (strcmp($1->type, $3->type)!=0) symerror("Incompatible types in a where expression", $1->name);

	char *tmp_str1=(char*)malloc(1024);
	char *tmp_str2=(char*)malloc(1024);
	
	if (strcmp($1->type, "string")!=0){
		sprintf(tmp_str1,"%s %s %s",$1->place,$2,$3->place);
		sprintf(tmp_str2,"%d",nextstat+3);
	}
	else{
		if(strcmp($2,"==")==0)
			sprintf(tmp_str1, "(strcmp( %s , %s )==0)", $1->place, $3->place);
		else if(strcmp($2,"!=")==0)
			sprintf(tmp_str1, "(strcmp( %s , %s )!=0)", $1->place, $3->place);
		else if($2[0]=='>')
			sprintf(tmp_str1, "(strcmp( %s , %s )>0)", $1->place, $3->place);
		else 
			sprintf(tmp_str1, "(strcmp( %s , %s )<0)", $1->place, $3->place);
	}


	

	$$=get_newtemp();
	/*emit(&emit_lst, "if", tmp_str1, "goto",tmp_str2,NULL);//original impl
	emit(&emit_lst, $$,"=","0",NULL, NULL);*/
	emit(&emit_lst, $$, "=", tmp_str1,NULL, NULL);
	/*sprintf(tmp_str2,"%d",nextstat+2);
	emit(&emit_lst, "goto", tmp_str2,NULL, NULL, NULL);
	emit(&emit_lst, $$,"=","1",NULL,NULL);*/

	free(tmp_str1);
	free(tmp_str2);

}
;

arith_expr: arith_expr arith_op arith_expr{
	if(strcmp($1->type,"integer")!=0 || strcmp($3->type,"integer")!=0) symerror("Only integers are allowed in arithmetic operations", $1);
	$$=create_node($1->name, $1->type, $1->kind, $1->owner);
	$$->place=get_newtemp();
	emit(&emit_lst, $$->place, "=", $1->place, $2, $3->place);
}	

| arith_op arith_expr{
	if(strcmp($2->type,"integer")!=0) symerror("Only integers are allowed in arithmetic operations", $2);
	$$=create_node($2->name, $2->type, $2->kind, $2->owner);
	$$->place=get_newtemp();
	emit(&emit_lst, $$->place, "=", $1, $2->place, NULL);
}
| names	{
	st_node *tmp=lookup_mult_tables(from_lst, len_from_lst, lst, $1);
	check_for_symerror(tmp, "Unknown attribute in where expressions", $1);
	if(tmp->kind==NULL || strcmp(tmp->kind, "attribute")!=0) symerror("Illegal non attribute in an arithmetic op", tmp->name);
	$$=create_node(tmp->name, tmp->type, tmp->kind, tmp->owner);
	///$$->place=strdup(tmp->name);
	$$->place=malloc(2048);
	if(tmp->place==NULL)
		sprintf($$->place, "%s.%s", tmp->owner->name, tmp->name);
	else
		sprintf($$->place, "%s.%s", tmp->owner->name, tmp->place);
	//printf("tmp: %s type %s $3 %s type %s\n",tmp->name, tmp->type, $3->name, $3->type);

}

| obj_names{
	$$=create_node($1->name, $1->type, $1->kind, $1->owner);
	$$->place=strdup($1->place);

}

| NUMBER {
	$$=create_node(yylval.string, "integer", NULL, NULL);
	$$->place=strdup($$->name);

}
;

obj_names: names DOT names{
	st_node *origin=lookup(lst, $1, "table", "table", NULL);
	check_for_symerror(origin, "Could not find parent table", $1);
	if(!is_in_from_lst(from_lst, len_from_lst, $1)) 
		symerror("Parent table does not appear in FROM table series", $1);
	st_node *tmp=lookup(lst, $3, NULL, "attribute", origin);
	check_for_symerror(tmp, "Unknown table attribute", $3);
	$$=create_node(tmp->name, tmp->type, tmp->kind, tmp->owner);
	$$->place=malloc(2048);
	if(tmp->place==NULL)
		sprintf($$->place, "%s.%s", origin->name, tmp->name);
	else
		sprintf($$->place, "%s.%s", origin->name, tmp->place);
}
;

comparison_op: EQUAL{$$=strdup("==");}
			|GREATER_EQUAL{$$=strdup(">=");}
			|LESS_EQUAL {$$=strdup("<=");}
			|GREATER {$$=strdup(">");}
			|LESS {$$=strdup("<");}
;

arith_op: PLUS {$$=strdup("+");}
		|MINUS{$$=strdup("-");}
		|MUL{$$=strdup("x");}
		|DIV{$$=strdup("/");}
		|MOD{$$=strdup("%");}

rvalue: CONST_CHAR{
	$$=create_node(yylval.string, "char", NULL, NULL);
	if($$->name[1]=='+') $$->name[1]='F'; //cannot predict whether user chooses F/+
	if($$->name[1]=='-') $$->name[1]='R'; //cannot predict whether user chooses R/-
}
| CONST_STRING {
	$$=create_node(yylval.string, "string", NULL, NULL);
}
/*| NUMBER{
	$$=create_node(yylval.string, "integer", NULL, NULL);
}*/
;

%%
extern FILE *yyin;

int main(){
	yydebug=1;
	yylval.entry = (st_node*) malloc(sizeof(st_node));
	yylval.entry->next=NULL;

	from_lst=(st_node**)malloc(sizeof(st_node*)*(MAX_FROM_TABLES+1));

	yyparse();
	if(errorNo==0){
		printf("Compilation completed without errors\n");
		fprintf(stderr,"Compilation completed without errors\n");
		output_emit_list(emit_lst);
		//writeToFile(target_file);//the intermediate code will be printed at argv[1].interm
	}
	else{
		printf("There were %d errors\n",errorNo);
		fprintf(stderr,"There were %d errors\n",errorNo);
	}

	/*st_node *tmp=lst;
	for(tmp=lst;tmp!=NULL;tmp=tmp->next){
		printf("%s %s %s",tmp->name, tmp->type, tmp->kind);
		if (tmp->owner!=NULL) printf(" %s\n",tmp->owner->name);
		else printf("\n");
	}*/
	

	return 0;
}

int yyerror()
{ 

	printf("line %d: syntax Error contents: %s\n",lineNo, yylval.string);

	///exit(2);
	errorNo++;
	if(errorNo>5){
		printf("Too many errors to continue\n");
		exit(1);
	}
	
	//return 1;
	
}

//if nd==NULL it calls symerror with msg and name as parameters
void check_for_symerror(st_node *nd, char *msg, char *name){
	if (nd==NULL)
		symerror(msg, name);
}

int symerror(char *msg, char *name){
	printf("line %d: Object: %s Symbol Error: %s\n",lineNo, name, msg);
	exit(2);
	errorNo++;
	if(errorNo>5){
		printf("Too many errors to continue\n");
		exit(1);
	}
	
	//return 1;
	
}

void ioerror(char *msg){
	fprintf(stderr, "FATAL ERROR!!! %s\n",msg);
	exit(2);
}

/*lst is the head of a list of st_node. The function
returns the node whose name, type, kind and owner match the input. If any of
type, kind, owner is NULL it is considered as wildcard.
The function returns NULL on failure*/
st_node *lookup(st_node *lst, char *name, char *type, char *kind, st_node *owner){
	st_node *ret;
	//printf("name: %s, lst: %x\n",name, lst);
	if(lst==NULL) return NULL;

	for (ret=lst;ret!=NULL;ret=ret->next){
		if(strcmp(name, ret->name)==0){
			if(type==NULL || strcmp(type, ret->type)==0){
				if(kind==NULL || strcmp(kind, ret->kind)==0){
					if(owner==NULL || owner==ret->owner){
						return ret;
					}
				}
			}
		}
	}
	return NULL;
}

//it creates a node whose properties are initialized from the input args
st_node *create_node(char *name, char *type, char *kind, st_node *owner){
	st_node *tmp=(st_node*)malloc(sizeof(st_node));
	if(name!=NULL) tmp->name=strdup(name); else tmp->name=NULL;
	if(type!=NULL) tmp->type=strdup(type); else tmp->type=NULL;
	if(kind!=NULL) tmp->kind=strdup(kind); else tmp->kind=NULL;
	tmp->owner=owner;
	tmp->next=NULL;
	tmp->place=NULL;
	return tmp;
}



/*lst is the head of a list of st_node. The function creates a node
whose data are taken from the input and adds it at the beginning of the list*/
//void add_node(st_node *lst, char *name, char *type, char *kind, st_node *owner){
/*lst is the head of a list of st_node in which newnode is going to be added
at the beginning of the list*/
void add_node(st_node **lst, st_node *newnode){
	if ((*lst)==NULL) *lst=newnode;
	else{
		newnode->next=*lst;
		*lst=newnode;
	}
}

//It creates a node with name node_info and adds it to the list at the place that precedes
//where_str. For example if the list consists of A->B->C and where_str=B, the new node
//is going to be placed between B and C. Now if there are multiple B's such as A->B->B-C
//the new node is going to be inserted between B and C
void squeeze_node(st_node *lst, char *where_str, char *node_info){
	st_node *tmp=lst;
	st_node *new_tmp_nxt;
	for(tmp=lst;tmp!=NULL;tmp=tmp->next){
		if(tmp->next==NULL) break;
		if(strstr(tmp->name, where_str)!=NULL && strstr(tmp->next->name, where_str)==NULL)
			break;
	}
	new_tmp_nxt=tmp->next;
	add_node(&new_tmp_nxt, create_node(node_info, NULL, NULL, NULL));
	tmp->next=new_tmp_nxt;
}

//It returns that node of lst that has been entered prior to list_node. In this implementation
//the answer is lst_node->next, but it can change if the list implementation changes.
st_node *get_previous_node(st_node *lst_node){
	if(lst_node==NULL) return NULL;
	else return lst_node->next;
}

//It adds newnode to the array list lst of length len_lst. The basic operation is
//lst[n++]=newnode
void add_node_to_array(st_node **lst, int *len_lst, st_node *newnode){
	int n=*len_lst;
	if(n>=MAX_FROM_TABLES) symerror("Cannot handle that many tables in the from statement", newnode->name);
	lst[n++]=newnode;
	*len_lst=n;
}


void destroy_list(st_node *lst){
	st_node *tmp, *vic;
	tmp=lst;
	while(tmp!=NULL){
		vic=tmp;
		tmp=tmp->next;
		free(vic->name);
		vic->name=NULL;
		free(vic->type);
		vic->type=NULL;
		free(vic->kind);
		vic->kind=NULL;
		free(vic);
		vic=NULL;
	}
	return;
}

//If lst does not contain already an attribute with the same name and the same
//owner, it creates one. Otherwise it returns NULL
st_node *check_and_create(st_node *lst, char *name, char *type, char *kind, st_node *cur_owner){
	st_node *ret=NULL;
	if (lookup(lst, name, type, "attribute", cur_owner)==NULL)
		ret=create_node(name, type, kind, cur_owner);
	return ret;
}

//it checks whether a node with the given name appears in from_lst. It
//returns 1 on success, 0 otherwise.
int is_in_from_lst(st_node **from_lst, int len_from_lst, char *name){
	int i=0;
	st_node *tmp;
	for(i=0;i<MAX_FROM_TABLES;i++){
		if(i>=len_from_lst) break;
		tmp=from_lst[i];
		if(strcmp(name, tmp->name)==0)
			return 1;
	}
	return 0;
}
		

//It returns that node of lst where the name matches and the owner is one
//of the tables of from_lst. Both lists contain pointers to the same 
//objects
st_node *lookup_mult_tables(st_node **from_lst, int len_from_lst, st_node *lst, char *name){
	st_node *tmp;
	st_node *hit=NULL;
	int i=0;
	//printf("!!!!!!!looking up name: %s len_list: %d\n",name, len_from_lst);
	for(i=0;i<MAX_FROM_TABLES;i++){
		if(i>=len_from_lst) break;
		tmp=from_lst[i];
		//printf("tbl name: %s tmp: %x\n",tmp->name,tmp);
		//for(hit=lst;hit!=NULL;hit=hit->next) if(hit->owner!=NULL) printf(">>>name: %s kind: %s owner: %s\n",hit->name, hit->kind, hit->owner->name);
		hit=lookup(lst, name, NULL, "attribute", tmp);
		if(hit!=NULL){
			//printf("actual hit: %x\n",hit);
			return hit;
		}
	}
	//printf("returning NULL\n");
	return NULL;
}

//it checks whether each of the nodes of arg_lst is a property of any of the 
//tables in the "from_args" and adds them in lst with owner as specified
//by the input
void check_and_copy_from_mult(st_node **lst, st_node *arg_lst, st_node **from_lst, int len_from_lst, st_node *owner){
	st_node *tmp;
	st_node *lkup;
	st_node *new_node;
	//printf("tmp: %s\n",arg_lst->name);
	for (tmp=arg_lst;tmp!=NULL;tmp=tmp->next){
		if(tmp->owner==NULL){
			lkup=lookup_mult_tables(from_lst, len_from_lst, *lst, tmp->name);
			tmp->owner=lkup->owner;
		}
		else
			lkup=lookup(*lst, tmp->name, NULL, NULL, tmp->owner);
		check_for_symerror(lkup, "An attribute in select is not contained in the from tables", tmp->name);
		new_node=create_node(lkup->name, lkup->type, lkup->kind, owner);
		new_node->place=malloc(2048);
		if(lkup->place==NULL)
			sprintf(new_node->place, "%s.%s",tmp->owner->name, lkup->name);
		else
			sprintf(new_node->place, "%s.%s",tmp->owner->name, lkup->place);
		add_node(lst, new_node);
	}
}



//It replicates all properties of lst whose owner is a table in the from_args
//and cur_owner is the owner of the new attributes.
void replicate_args(st_node **from_lst, int len_from_lst, st_node **lst, st_node *cur_owner){
	//printf("Replicating for cur_owner %s\n",cur_owner->name);
	st_node *tmp;
	st_node *new_node;
	int i=0;
	for (tmp=*lst;tmp!=NULL;tmp=tmp->next){
		if(strcmp(tmp->kind, "attribute")==0 && (tmp->owner!=NULL)){
			//printf("name %s kind %s owner %s from_name: %s\n",tmp->name, tmp->kind, tmp->owner->name, from_lst[0]->name);
			for(i=0;i<len_from_lst;i++){
				if(strcmp(from_lst[i]->name, tmp->owner->name)==0 && strcmp(from_lst[i]->kind, "table")==0){
					/////if(lookup(from_lst, tmp->owner->name, "table", "table", NULL)!=NULL){ //check if the owner table of tmp is in from_lst
					//printf("adding node %s with owner %s\n",tmp->name, cur_owner->name);
					new_node=create_node(tmp->name, tmp->type, tmp->kind, cur_owner);
					new_node->place=malloc(2048);
					if(tmp->place!=NULL)
						sprintf(new_node->place, "%s.%s",from_lst[i]->name, tmp->place);
					else
						sprintf(new_node->place, "%s.%s",from_lst[i]->name, tmp->name);
					add_node(lst, new_node);
					break;
				}
			}
		}
	}
	return;
}

//it adds to em_lst an st_node whose name is the concatenation of str1...4 
//and also increases nextstat.
void emit(st_node **em_lst, char *str1, char *str2, char *str3, char *str4, char *str5){
	char *str=(char*)malloc(2048);
	int cnt=0;
	*str='\0';
	if(str1!=NULL){
		strcat(str, str1);
		strcat(str," ");
		cnt+=strlen(str1);
	}
	if(str2!=NULL){
		strcat(str, str2);
		strcat(str," ");
		cnt+=strlen(str2);
	}
	if(str3!=NULL){
		strcat(str, str3);
		strcat(str," ");
		cnt+=strlen(str3);
	}
	if(str4!=NULL){
		strcat(str, str4);
		strcat(str," ");
		cnt+=strlen(str4);
	}
	if(str5!=NULL){
		strcat(str, str5);
		strcat(str," ");
		cnt+=strlen(str5);
	}
	if(cnt>=2048){ioerror("Too many characters appended to emit");}
	add_node(em_lst, create_node(str, NULL, NULL, NULL));
	nextstat++;
}

//it traverses lst backwards and outputs the name of each node.
//Remember: nodes have been added to the top of the list each time.
//So the list needs to be tranversed in a reverse direction.
void output_emit_list(st_node *lst){
	static int i=1;
	if (lst==NULL) return;
	output_emit_list(lst->next);
	printf("%d. %s\n", i++, lst->name);
}


//it generates a new temporary variable
char *get_newtemp(){
	static int cnt=0;
	char *ret=(char *)malloc(sizeof(char)*(50));
	sprintf(ret, "t%d",cnt++);
	return ret;
}

//It opens the file that contains the parsed tables and it loads the table and the respective
//parameters to symbl_lst. If name!=READS, it also populates emit_lst with the proper commands
void load_table(st_node **symbl_lst, st_node **emit_lst, char *parsed_table_file, char *name){
	FILE *fp=fopen(parsed_table_file, "r");
	if(fp==NULL) ioerror("Cannot open the file of parsed_tables");
	char *buf=malloc(2048);
	char *tok;
	int table_found=0;
	char *type;
	char *pname;
	st_node *nd;
	if (fgets(buf, 2048, fp)==NULL) ioerror("Can't read the first line");
	while(fgets(buf, 2048, fp)!=NULL){
		if (strstr(buf, " load_table")!=NULL && strstr(buf, name)!=NULL){//the table was located
			table_found=1;
			if(lookup(*symbl_lst, name, NULL, NULL, NULL)==NULL){
				nd=create_node(name, "table", "table", NULL);
				cur_owner=nd;
				add_node(symbl_lst, nd);
				if(strcmp(name,"READS")!=0)
					emit(emit_lst, "load_table", name, NULL, NULL,NULL);
			}
			else symerror("Conflict with table names", name);
		}
		else if(strstr(buf,"loaded_param")!=NULL && table_found){
			tok=strtok(buf, " "); //the line No
			tok=strtok(NULL, " "); //the "loaded_param" keyword
			tok=strtok(NULL, " "); //the type
			type=tok;
			tok=strtok(NULL, " "); //the parameter name
			pname=tok;
			//pname[strlen(pname)-1]='\0'; //get rid of '\n'
			if (strcmp(type, "int")==0)
				nd=check_and_create(*symbl_lst, pname, "integer", "attribute", cur_owner);
			else if(strcmp(type, "float")==0)
				nd=check_and_create(*symbl_lst, pname, "float", "attribute", cur_owner);
			else if(strcmp(type, "char")==0)
				nd=check_and_create(*symbl_lst, pname, "char", "attribute", cur_owner);
			else if(strcmp(type, "char*")==0)
				nd=check_and_create(*symbl_lst, pname, "string", "attribute", cur_owner);
			else symerror("Unknown type", pname);
			if(nd!=NULL) add_node(symbl_lst, nd);
			else symerror("Conflicting attribute names", pname);
			if(strcmp(name, "READS")!=0)
				emit(emit_lst, "loaded_param", type, pname, NULL,NULL);
		}
		else if(strstr(buf, "end_load_table")!=NULL && table_found){
			table_found=0;
			if(strcmp(name, "READS")!=0)
				emit(emit_lst, "end_load_table", NULL, NULL, NULL,NULL);
			free(buf);
			fclose(fp);
			return;
		}
	}
	symerror("Cannot import a table with the given name", name);
}
