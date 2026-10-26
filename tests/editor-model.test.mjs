import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInput,validateRecord,changes,updateRequests,cellValue} from '../docs/editor-model.js';
test('unknown, zero and boolean remain distinct',()=>{assert.equal(parseInput('maxWeeklyWorkDays',''),'');assert.equal(parseInput('maxWeeklyWorkDays','0'),0);assert.equal(parseInput('allowed','false'),false);assert.throws(()=>parseInput('maxWeeklyWorkDays','8'));assert.throws(()=>parseInput('maxWeeklyWorkDays','2.5'));});
test('reject invalid ranges and employee name',()=>{assert.throws(()=>validateRecord(['employeeId','displayName'],['EMP001',''],'Employees'));assert.throws(()=>validateRecord(['requiredHeadcount','MaxStaff'],[4,2],'DailyShiftDemands'));assert.throws(()=>validateRecord(['date','isClosed','requiredHeadcount'],['2026-11-01',true,2],'DailyShiftDemands'));});
test('only changed cells are written, preserving other fields and formulas',()=>{const diff=changes(['id','displayName','maxWeeklyHours'],['EMP001','甲',40],['EMP001','乙',40]);const req=updateRequests(123,5,diff);assert.equal(req.length,1);assert.deepEqual(req[0].updateCells.start,{sheetId:123,rowIndex:5,columnIndex:1});assert.equal(req[0].updateCells.fields,'userEnteredValue');});
test('user text is never interpreted as a spreadsheet formula',()=>assert.deepEqual(cellValue('=IMPORTXML("x")'),{userEnteredValue:{stringValue:'=IMPORTXML("x")'}}));
test('clearing a value remains an explicit changed cell',()=>{assert.deepEqual(changes(['maxWeeklyHours'],[40],['']),[{key:'maxWeeklyHours',index:0,before:40,after:''}]);});
