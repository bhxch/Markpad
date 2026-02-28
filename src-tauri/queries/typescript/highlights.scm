; TypeScript highlights - based on JavaScript with TypeScript-specific additions
; Variables
;----------

(identifier) @variable

; Properties
;-----------

(property_identifier) @property

; Function and method definitions
;--------------------------------

(function_expression
  name: (identifier) @function)
(function_declaration
  name: (identifier) @function)
(method_definition
  name: (property_identifier) @function.method)

(pair
  key: (property_identifier) @function.method
  value: [(function_expression) (arrow_function)])

(assignment_expression
  left: (member_expression
    property: (property_identifier) @function.method)
  right: [(function_expression) (arrow_function)])

(variable_declarator
  name: (identifier) @function
  value: [(function_expression) (arrow_function)])

(assignment_expression
  left: (identifier) @function
  right: [(function_expression) (arrow_function)])

; Function and method calls
;--------------------------

(call_expression
  function: (identifier) @function)

(call_expression
  function: (member_expression
    property: (property_identifier) @function.method))

; Special identifiers
;--------------------

((identifier) @constructor
  (#match? @constructor "^[A-Z]"))

((identifier) @constant
  (#match? @constant "^[A-Z_][A-Z\\d_]+$"))

; TypeScript-specific
;--------------------

; Types
(type_identifier) @type
(predefined_type) @type.builtin

; Type parameters
(type_parameter) @type.parameter

; Interface
(interface_declaration
  name: (type_identifier) @type)

; Type alias
(type_alias_declaration
  name: (type_identifier) @type)

; Enum
(enum_declaration
  name: (identifier) @type)

(enum_assignment
  name: (property_identifier) @constant)

; Namespace
(module
  name: (identifier) @namespace)

; Decorators
(decorator
  "@" @attribute
  (identifier) @attribute)

; Keywords
"abstract" @keyword
"as" @keyword
"const" @keyword
"declare" @keyword
"enum" @keyword
"export" @keyword.control.import
"extends" @keyword
"from" @keyword.control.import
"implements" @keyword
"import" @keyword.control.import
"interface" @keyword
"module" @keyword
"namespace" @keyword
"private" @keyword
"protected" @keyword
"public" @keyword
"readonly" @keyword
"type" @keyword

; Literals
;---------
(this) @variable.builtin
(super) @variable.builtin

(true) @constant.builtin.boolean
(false) @constant.builtin.boolean
(null) @constant.builtin
(undefined) @constant.builtin

(comment) @comment

(string) @string
(template_string) @string

(number) @constant.numeric

(regex) @string.regexp

; Punctuation
;------------
";" @punctuation.delimiter
"." @punctuation.delimiter
"," @punctuation.delimiter
":" @punctuation.delimiter

"(" @punctuation.bracket
")" @punctuation.bracket
"[" @punctuation.bracket
"]" @punctuation.bracket
"{" @punctuation.bracket
"}" @punctuation.bracket

; Operators
;----------
"--" @operator
"-" @operator
"-=" @operator
"!" @operator
"!=" @operator
"!==" @operator
"=" @operator
"==" @operator
"===" @operator
"=>" @operator
"+" @operator
"++" @operator
"+=" @operator
"*" @operator
"*=" @operator
"/" @operator
"/=" @operator
"%" @operator
"%=" @operator
"<" @operator
"<=" @operator
"<<" @operator
"<<=" @operator
">" @operator
">=" @operator
">>" @operator
">>=" @operator
">>>" @operator
">>>=" @operator
"&" @operator
"&=" @operator
"&&" @operator
"|" @operator
"|=" @operator
"||" @operator
"??" @operator
"^" @operator
"^=" @operator
"~" @operator
"?" @operator
"?." @operator
"??" @operator

; Keywords
;---------
"async" @keyword
"await" @keyword.control
"break" @keyword.control
"case" @keyword.control.conditional
"catch" @keyword.control.exception
"class" @keyword
"continue" @keyword.control
"debugger" @keyword
"default" @keyword
"delete" @keyword
"do" @keyword.control.repeat
"else" @keyword.control.conditional
"finally" @keyword.control.exception
"for" @keyword.control.repeat
"function" @keyword.function
"if" @keyword.control.conditional
"in" @keyword.operator
"instanceof" @keyword.operator
"let" @keyword
"new" @keyword
"of" @keyword.operator
"return" @keyword.control.return
"static" @keyword
"switch" @keyword.control.conditional
"throw" @keyword.control.exception
"try" @keyword.control.exception
"typeof" @keyword.operator
"var" @keyword
"void" @keyword
"while" @keyword.control.repeat
"with" @keyword
"yield" @keyword