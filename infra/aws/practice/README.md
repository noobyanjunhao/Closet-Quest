# Closet Quest isolated AWS practice stack

Status on November 9, 2026: prepared locally, **not deployed**. Browser login and AWS CLI identity verification now succeed. The Free Tier API reports `accountPlanType: FREE`, `accountPlanStatus: NOT_STARTED`, USD 100 remaining, and expiration `2027-05-10T01:19:08.409173Z` (May 9 locally). CloudFormation `ListStacks` returns `OptInRequired`; Lambda `ListFunctions` and DynamoDB `ListTables` return `SubscriptionRequiredException`, all saying the identity needs a service subscription. These are AWS API failures as well as console failures; fixing browser navigation alone does not resolve them. No paid upgrade, practice resource, or model call has been made.

This stack is separate from the production app and the earlier optional live catalog worker. It uses only three fixed synthetic garments. Its Lambda has read/write permission on its own DynamoDB table and write permission on its own one-day CloudWatch log group. There is no OpenAI key, Secrets Manager resource, retailer request, production wardrobe access, public API, scheduled invocation, NAT gateway or GPU. It is invoked manually through the authenticated AWS console. DynamoDB on-demand requests, Lambda and logs can consume AWS credits; the template itself is not a billing cap or a promise of free usage on a Paid account.

## Reproduce preparation and local checks

```sh
node scripts/prepare-aws-practice.mjs
node --test tests/aws-practice.test.js
node scripts/experiment-aws-practice.mjs
cfn-lint output/aws-practice/template.json
```

The generated plain CloudFormation template embeds the handler, so no separate deployment-code bucket or SAM packaging step is required. The console may store an uploaded template in its own S3 bucket; that resource must also be included in credit/cleanup checks. Node.js 24 supplies the AWS SDK v3 for inline Lambda functions; its runtime version may differ from the pinned local SDK, so actual deployed tests remain necessary. See [AWS runtime guidance](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html).

## Required gate before deployment

1. The user resolves signup/payment verification privately. Stop if activation demands an unacceptable payment or Paid-plan upgrade. A temporary card hold is not silently authorized.
2. Inspect the actual console account plan, available credits, expiration date and service availability. Continue only on the **Free account plan**, with credits, without activating paid-only features. A credit balance alone on a Paid account does not satisfy the user's condition.
3. Prepare a stack named `closet-quest-practice` in one supported region. Inspect the exact resource changes and role permissions before granting new access. Do not connect Render or Supabase to this practice stack.
4. Run the bounded tests below and record actual AWS results separately. Keep schedules absent. Before any later paid upgrade, remove all practice resources with explicit approval. Do not assume account credits cover external OpenAI API usage.

## Local connection and activation diagnosis

AWS CLI 2.39.7 and uv 0.13.7 are installed for the Windows user. Browser authentication succeeded for the named `closet-quest` profile. The Agent Toolkit installer completed, installed 25 default skills, and its remote catalog returned 121 available skills. Codex alone is bound to this profile through `AWS_MCP_PROXY_PROFILES`; the installer-created unbound AWS entries were removed from Cursor and Claude, with local backups retained. Other configuration entries were preserved.

The MCP Proxy for AWS 1.8.0 completed initialization, listed eight tools, and successfully executed a read-only `aws___search_documentation` call (`isError: false`). The initial test harness needed a refreshed Windows process PATH and the installed Python MCP SDK's serialized field aliases; both were corrected. Restart Codex to load its new MCP configuration and inherited user PATH. Project `AGENTS.md` contains the official AWS project guidance with the user's no-money and Codex-only constraints taking precedence. Toolkit connectivity does not establish that deployment services are enabled: the latest CloudFormation check still returned `OptInRequired`.

Read-only checks to repeat after AWS finishes activation:

```sh
aws sts get-caller-identity --profile closet-quest
aws freetier get-account-plan-state --region us-east-1 --profile closet-quest
aws cloudformation list-stacks --region us-east-2 --profile closet-quest
aws lambda list-functions --region us-east-2 --profile closet-quest --max-items 1
aws dynamodb list-tables --region us-east-2 --profile closet-quest --limit 1
```

Do not use `upgrade-account-plan`, activate advanced features, create another Region's resources, or weaken IAM policies as an activation workaround. `account:GetRegionOptStatus` is explicitly denied by the AWS-managed project service control policy; that denial does not prove the selected Region is incorrect. Project resources use Ohio (`us-east-2`); the Toolkit endpoint uses `us-east-1` as required by its official setup guide.

If the service errors remain after AWS's stated activation window (up to 24 hours), ask AWS account support to complete activation while retaining the Free plan. Include the exact error codes, successful STS authentication, and `FREE / NOT_STARTED` status. Share the project/account identifier only through authenticated AWS support. Never send credentials, tokens, or the local login cache.

## Cloud experiment to execute after the gate

Invoke `{"category":"Top"}` twice: first response should have `cached:false`, second `cached:true`. Repeat once for `Bottom` and `Shoes`. Use `{"category":"Unknown"}` once and verify rejection. Inspect the synthetic rows and CloudWatch events without adding private data. Record Lambda duration, error outcomes and before/after credit usage; billing can be delayed. The local experiment additionally exercises 20 requests from two independent SDK clients, application-controlled expiry and conditional-write recovery. It does not establish cloud capacity or IAM correctness.

Stack deletion is configured to delete the synthetic table and log group as well as the function and role. That action requires approval; no production resource is retained or deleted by this template. Any template-upload S3 object/bucket is outside the stack and needs separate review.

Account guidance: [Free plan and credits](https://aws.amazon.com/free/), [signup verification](https://aws.amazon.com/resources/create-account/). Do not select a Paid plan to unlock a service that is unavailable in this account.
