import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
// Plain CloudFormation JSON supports direct console upload, no SAM/package bucket.
const template={
 AWSTemplateFormatVersion:'2010-09-09',
 Description:'Closet Quest isolated synthetic catalog practice. Deploy only on a verified AWS Free account plan. No paid AI calls.',
 Resources:{
  Catalog:{Type:'AWS::DynamoDB::Table',DeletionPolicy:'Delete',UpdateReplacePolicy:'Delete',Properties:{BillingMode:'PAY_PER_REQUEST',AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'}],KeySchema:[{AttributeName:'pk',KeyType:'HASH'}],SSESpecification:{SSEEnabled:true},TimeToLiveSpecification:{AttributeName:'expiresAt',Enabled:true}}},
  PracticeLogs:{Type:'AWS::Logs::LogGroup',DeletionPolicy:'Delete',Properties:{RetentionInDays:1}},
  PracticeRole:{Type:'AWS::IAM::Role',Properties:{AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]},Policies:[{PolicyName:'PracticeTableAndLogsOnly',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem'],Resource:{'Fn::GetAtt':['Catalog','Arn']}},{Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:{'Fn::GetAtt':['PracticeLogs','Arn']}}]}}]}},
  CatalogFunction:{Type:'AWS::Lambda::Function',Properties:{Runtime:'nodejs24.x',Handler:'index.handler',MemorySize:128,Timeout:10,Role:{'Fn::GetAtt':['PracticeRole','Arn']},LoggingConfig:{LogGroup:{Ref:'PracticeLogs'}},Environment:{Variables:{PRACTICE_TABLE:{Ref:'Catalog'}}},Code:{ZipFile:readFileSync('infra/aws/practice/catalog.cjs','utf8')}}},
 },
 Outputs:{FunctionName:{Value:{Ref:'CatalogFunction'}},TableName:{Value:{Ref:'Catalog'}},LogGroup:{Value:{Ref:'PracticeLogs'}}},
};
mkdirSync('output/aws-practice',{recursive:true});
writeFileSync('output/aws-practice/template.json',JSON.stringify(template,null,2)+'\n');
console.log('Prepared output/aws-practice/template.json; no cloud resources created.');
