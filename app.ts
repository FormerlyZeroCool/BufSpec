const fs = require("fs");
//Parse .env file
const dotenv = require('dotenv');
dotenv.config();
const tsTypesMap:any = JSON.parse(fs.readFileSync(process.env.CONVERSION_JSON));
const src:string = fs.readFileSync(process.env.COMPILATION_SOURCE).toString();
const variable_regex:RegExp = new RegExp(process.env.VARIABLE_REGEX, 'g');

class FieldRecord {
    type:string;
    fieldName:string;
    FieldRecord;
    constructor(record:string)
    {
        const data = record.split(":");
        this.type = data[0];
        this.fieldName = data[1];
        if(this.fieldName.replace(variable_regex, "").length !== this.fieldName.length) 
            throw new Error("Error invalid field name:" + this.fieldName);
    }
};
class Fields {
    hasHeader:boolean;
    bools:Array<FieldRecord>;
    int8s:Array<FieldRecord>;
    int16s:Array<FieldRecord>;
    int32s:Array<FieldRecord>;
    doubles:Array<FieldRecord>;
    bool_arrays:Array<FieldRecord>;
    int8_arrays:Array<FieldRecord>;
    int16_arrays:Array<FieldRecord>;
    int32_arrays:Array<FieldRecord>;
    compilationConfiguration:any;
    constructor(source:string, compilationConfig:any)
    {
        this.compilationConfiguration = compilationConfig;
        this.hasHeader = false;
        this.bools = new Array<FieldRecord>();
        this.int8s = new Array<FieldRecord>();
        this.int16s = new Array<FieldRecord>();
        this.int32s = new Array<FieldRecord>();
        this.doubles = new Array<FieldRecord>();
        this.bool_arrays = new Array<FieldRecord>();
        this.int8_arrays = new Array<FieldRecord>();
        this.int16_arrays = new Array<FieldRecord>();
        this.int32_arrays = new Array<FieldRecord>();
        const recordsAsStrings:Array<string> = source.replace(" ", "").split("\n");
        recordsAsStrings.forEach(el => {
            const record:FieldRecord = new FieldRecord(el);
            switch(record.type)
            {
                case("bool"):
                this.bools.push(record);
                break;
                case("int8"):
                this.int8s.push(record);
                break;
                case("int16"):
                this.int16s.push(record);
                break;
                case("int32"):
                this.int32s.push(record);
                break;
                case("doubles"):
                this.doubles.push(record);
                break;
                case("bool_array"):
                this.bool_arrays.push(record);
                break;
                case("int8_array"):
                this.int8_arrays.push(record);
                break;
                case("int16_array"):
                this.int16_arrays.push(record);
                break;
                case("int32_array"):
                this.int32_arrays.push(record);
                break;
            };
        });
    }
    processFieldDeclaration(rec:FieldRecord, program:Array<string>, throwError:boolean = true)
    {
        const declarationTemplate:Array<any> = this.compilationConfiguration.declarationTemplate;
        
        let typeDefined:boolean = false;
        for(let i = 0; i < declarationTemplate.length; i++)
        {
            const part = declarationTemplate[i];
            switch(part.type)
            {
                case("variable_name"):
                program.push(rec.fieldName);
                break;
                case("boiler"):
                program.push(part.data);
                break;
                case("type"):
                program.push(this.compilationConfiguration.types_map[rec.type]);
                typeDefined = this.compilationConfiguration.types_map[rec.type];
                break;
            }
        }
        if(throwError && (!typeDefined))
            throw Error("Error no type defined")
    }
    processDataTypeDS(recordArray:Array<FieldRecord>, src:Array<string>):number
    {
        let i = 0;
        for(; i < recordArray.length; i++)
        {
            const boolField:FieldRecord =  recordArray[i];
            this.processFieldDeclaration(boolField, src);
            src.push(this.compilationConfiguration.struct_field_separator);
            src.push('\n');
        }
        return i;
    }
    compileDataStructure():Array<string>
    {
        const code:Array<string> = new Array<string>();
        const opening:string = this.compilationConfiguration.struct_opening_wrapper.replace("$object_wrapper_name", this.compilationConfiguration.object_wrapper_name);
        code.push(opening);
        code.push('\n');
        let i = this.processDataTypeDS(this.bools, code);
        i += this.processDataTypeDS(this.int8s, code);
        i += this.processDataTypeDS(this.int16s, code);
        i += this.processDataTypeDS(this.int32s, code);
        i += this.processDataTypeDS(this.doubles, code);
        //to do code for arrays
        code.push(this.compilationConfiguration.struct_closing_wrapper);
        return code;
    }
    paddedInt8Length():number
    {
        return this.int8s.length*8;
    }
    paddedBoolLength():number
    {
        return this.bools.length + (8 - this.bools.length % 8);
    }
    paddedInt16Length():number
    {
        return this.int16s.length*16;
    }
    totalBitSize():number
    {
        return this.paddedBoolLength() + this.paddedInt8Length() + 
            this.paddedInt16Length() + this.int32s.length*32 + this.doubles.length*64;
    }
    compileInitRawDataStructure(src:Array<string>)
    {
        const template:any = this.compilationConfiguration.raw_type_instantiation;
        for(let i = 0; i < template.length; i++)
        {
            switch(template[i].type)
            {
                case("raw_type"):
                src.push(this.compilationConfiguration.raw_type);
                break;
                case("raw_byte_size"):
                src.push((Math.floor(this.totalBitSize() / 8)).toString());
                break;
                case("variable_name"):
                src.push(this.compilationConfiguration.raw_variable_name);
                break;
                case("boiler"):
                src.push(template[i].data);
                break;
            }
        }
    }
    compileArrayAccess(dataStructureVariable:string, arrayIndex:number):string
    {
        const template:Array<any> = this.compilationConfiguration.operators.array_accessor;
        const code:Array<string> = new Array<string>();
        for(let i = 0; i < template.length; i++)
        {
            const part:any = template[i];
            switch(part.type)
            {
                case("boiler"):
                code.push(part.data);
                break;
                case("data_structure"):
                code.push(dataStructureVariable);
                break;
                case("index"):
                code.push(arrayIndex.toString());
                break;
            }
        }
        return code.join('');
    }
    compileAccessPropertyAsNumber(dataStructureVariable:string, propertyName:string):string
    {
        const template:Array<any> = this.compilationConfiguration.propertyAccessAsNumber;
        const code:Array<string> = new Array<string>();
        for(let i = 0; i < template.length; i++)
        {
            const part:any = template[i];
            switch(part.type)
            {
                case("boiler"):
                code.push(part.data);
                break;
                case("variable_name"):
                code.push(dataStructureVariable);
                break;
                case("property_name"):
                code.push(propertyName);
                break;
            }
        }
        return code.join('');
    }
    compileAccessProperty(dataStructureVariable:string, propertyName:string):string
    {
        const template:Array<any> = this.compilationConfiguration.propertyAccess;
        const code:Array<string> = new Array<string>();
        for(let i = 0; i < template.length; i++)
        {
            const part:any = template[i];
            switch(part.type)
            {
                case("boiler"):
                code.push(part.data);
                break;
                case("variable_name"):
                code.push(dataStructureVariable);
                break;
                case("property_name"):
                code.push(propertyName);
                break;
            }
        }
        return code.join('');
    }
    compileEncodeBody(paramName:string):string
    {
        const code:Array<string> = new Array();
        this.compileInitRawDataStructure(code);
        code.push('\n');
        let bitIndex = 0;
        for(let i = 0; i < this.bools.length; i++)
        {
            const bitShift:number = bitIndex % 8;
            const arrayIndex:number = Math.floor(bitIndex / 8);
            code.push(this.compileArrayAccess(this.compilationConfiguration.raw_variable_name, arrayIndex));
            code.push(this.compilationConfiguration.operators.bitwise_or_and_assign_left);
            code.push(this.compileAccessPropertyAsNumber(paramName, this.bools[i].fieldName));
            code.push(this.compilationConfiguration.operators.bitshift_left);
            code.push(bitShift.toString());
            code.push(this.compilationConfiguration.struct_field_separator);
            code.push("\n");
            bitIndex++;
        }
        bitIndex += 8 - bitIndex % 8;
        for(let i = 0; i < this.int8s.length; i++)
        {
            const bitShift:number = bitIndex % 8;
            const arrayIndex:number = Math.floor(bitIndex / 8);
            code.push(this.compileArrayAccess(this.compilationConfiguration.raw_variable_name, arrayIndex));
            code.push(this.compilationConfiguration.operators.bitwise_or_and_assign_left);
            code.push(this.compileAccessProperty(paramName, this.int8s[i].fieldName));
            code.push(this.compilationConfiguration.struct_field_separator);
            code.push("\n");
            bitIndex += 8;
        }
        for(let i = 0; i < this.int16s.length; i++)
        {
            const bitShift:number = bitIndex % 8;
            const arrayIndex:number = Math.floor(bitIndex / 8);
            code.push(this.compileArrayAccess(this.compilationConfiguration.raw_variable_name, arrayIndex));
            code.push(this.compilationConfiguration.operators.bitwise_or_and_assign_left);
            code.push(this.compileAccessProperty(paramName, this.int16s[i].fieldName));
            code.push(this.compilationConfiguration.struct_field_separator);
            code.push("\n");
            
            code.push(this.compileArrayAccess(this.compilationConfiguration.raw_variable_name, arrayIndex+1));
            code.push(this.compilationConfiguration.operators.bitwise_or_and_assign_left);
            code.push(this.compileAccessProperty(paramName, this.int16s[i].fieldName));
            
            code.push(this.compilationConfiguration.operators.bitshift_right);
            code.push('8');
            code.push(this.compilationConfiguration.struct_field_separator);
            code.push("\n");
            bitIndex += 16;
        }
        code.push("return ");
        code.push(this.compilationConfiguration.raw_variable_name);
        code.push(this.compilationConfiguration.struct_field_separator);
        return code.join('');
    }
    compileEncodeFunction():Array<string>
    {
        const code:Array<string> = new Array<string>();
        const template:any = this.compilationConfiguration.function_template;
        const paramName:string = "jsObject";
        for(let i = 0; i < template.length; i++)
        {
            const portion:any = template[i];
            switch(portion.type)
            {
                case("boiler"):
                code.push(portion.data);
                code.push(" ");
                break;
                case("function_name"):
                code.push("encode");
                break;
                case("param"):
                this.processFieldDeclaration(new FieldRecord(`object_wrapper_name:${paramName}`), code, false);
                break;
                case("return_type"):
                code.push(this.compilationConfiguration.raw_type);
                break;
                case("body"):
                code.push('\n');
                code.push(this.compileEncodeBody(paramName));
                code.push('\n');
                break;
            }
        }
        return code;
    }
    compile_object_wrapper_declaration(variable_name:string):string
    {
        const code:Array<string> = new Array<string>();
        const template:Array<any> = this.compilationConfiguration.object_wrapper_declaration;
        for(let i = 0; i < template.length; i++)
        {
            const portion:any = template[i];
            switch(portion.type)
            {
                case("boiler"):
                code.push(portion.data);
                break;
                case("variable_name"):
                code.push(variable_name);
                break;
                case("object_wrapper_name"):
                code.push(this.compilationConfiguration.object_wrapper_name);
                break;
            }
        }
        return code.join('');
    }
    compileDecodeBody(paramName:string):string
    {
       
        const code:Array<string> = new Array(); 
        const objectName:string = "obj";
        code.push(this.compile_object_wrapper_declaration(objectName));
        let bitIndex = 0;
        for(let i = 0; i < this.bools.length; i++)
        {
            const bitShift:number = bitIndex % 8;
            const arrayIndex:number = Math.floor(bitIndex / 8);
            code.push(this.compileAccessProperty(objectName, this.bools[i].fieldName));
            code.push(this.compilationConfiguration.operators.left_assignment);
            code.push(this.compileArrayAccess(paramName, arrayIndex));
            code.push(this.compilationConfiguration.operators.bitshift_right);
            code.push(bitShift.toString());
            code.push(this.compilationConfiguration.operators.bitwise_and);
            code.push('1');
            code.push(this.compilationConfiguration.struct_field_separator);
            code.push('\n');

            bitIndex++;
        }

        bitIndex += 8 - bitIndex % 8;
        for(let i = 0; i < this.int8s.length; i++)
        {
            const arrayIndex:number = Math.floor(bitIndex / 8);
            code.push(this.compileAccessProperty(objectName, this.int8s[i].fieldName));
            code.push(this.compilationConfiguration.operators.left_assignment);
            code.push(this.compileArrayAccess(paramName, arrayIndex));
            code.push(this.compilationConfiguration.struct_field_separator);
            code.push('\n');

            bitIndex += 8;
        }
        for(let i = 0; i < this.int16s.length; i++)
        {
            const arrayIndex:number = Math.floor(bitIndex / 8);
            code.push(this.compileAccessProperty(objectName, this.int16s[i].fieldName));
            code.push(this.compilationConfiguration.operators.left_assignment);
            code.push(this.compileArrayAccess(paramName, arrayIndex));
            code.push(this.compilationConfiguration.struct_field_separator);
            code.push('\n');
            code.push(this.compileAccessProperty(objectName, this.int16s[i].fieldName));
            code.push(this.compilationConfiguration.operators.bitwise_or_and_assign_left);
            code.push(this.compileArrayAccess(paramName, arrayIndex+1));
            code.push(this.compilationConfiguration.operators.bitshift_left);
            code.push('8');

            code.push('\n');

            bitIndex += 16;
        }
        code.push('return ');
        code.push(objectName);
        return code.join('');
    }
    compileDecodeFunction():Array<string>
    {
        const code:Array<string> = new Array<string>();
        const template:any = this.compilationConfiguration.function_template;
        const paramName:string = "raw";
        for(let i = 0; i < template.length; i++)
        {
            const portion:any = template[i];
            switch(portion.type)
            {
                case("boiler"):
                code.push(portion.data);
                code.push(" ");
                break;
                case("function_name"):
                code.push("decode");
                break;
                case("param"):
                this.processFieldDeclaration(new FieldRecord(`raw_byte_array:${paramName}`), code, false);
                break;
                case("return_type"):
                code.push(this.compilationConfiguration.object_wrapper_name);
                break;
                case("body"):
                code.push('\n');
                code.push(this.compileDecodeBody(paramName));
                code.push('\n');
                break;
            }
        }
        return code;
    }
}

const fieldList:Fields = new Fields(src, tsTypesMap);
console.log(fieldList.compileDataStructure().join(''));
const code:Array<string> = new Array<string>();
fieldList.compileInitRawDataStructure(code);

console.log(fieldList.compileEncodeFunction().join(''));
console.log(fieldList.compileDecodeFunction().join(''));