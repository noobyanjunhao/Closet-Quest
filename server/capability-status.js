// Configuration/discovery metadata, never a live inference health claim.
export function capabilityStatus({hosted=false,models,installedModels=[],openai={},stylistPolicy='standard',purchaseImports={enabled:false},busy=false,pipelineVersion,depop={}}){
  const discovered=Array.isArray(installedModels)?installedModels:[];
  const installed=name=>!hosted&&discovered.some(model=>model?.name===name);
  const localRecognitionReady=installed(models.recognition),stylistReady=installed(models.stylist),embeddingReady=installed(models.embedding);
  const configured=openai.configured===true,validPolicy=['standard','offline'].includes(stylistPolicy),offline=stylistPolicy==='offline';
  const providers=(localReady,allowCloud=true)=>[...(configured&&allowCloud?['openai']:[]),...(localReady?['local']:[])];
  return {
    model:models.recognition,models,hosted,localInferenceAvailable:!hosted,
    openai:{...openai,configured,verified:false,verification:configured?'configuration-only':'not-configured'},
    depop:{...depop,available:!hosted&&depop.configured===true,...(hosted?{reason:'Disabled on the hosted beta.'}:{})},
    recommendationReady:validPolicy,pipelineVersion,
    ready:localRecognitionReady&&stylistReady,localRecognitionReady,
    recognitionReady:localRecognitionReady||configured,stylistReady,embeddingReady,busy,durableJobs:true,
    jobPersistence:{storage:'server-disk',survivesProcessRestart:true,survivesHostReplacement:false},
    capabilities:{
      recognition:{providers:providers(localRecognitionReady)},
      styling:{providers:validPolicy?['auto','quick',...(offline?[]:providers(stylistReady))]:[],policy:validPolicy?stylistPolicy:'invalid'},
      embeddings:{providers:providers(embeddingReady)},
      purchaseImports:{enabled:purchaseImports.enabled===true,...(purchaseImports.provider?{provider:purchaseImports.provider}:{})},
    },
    notes:[hosted?'Local models run on a developer machine and are unavailable on this hosted service.':'Local model availability comes from discovery, not a generation test.',
      'A configured cloud API key does not verify model access, billing or successful inference.',
      ...(validPolicy?[]:['Styling configuration is invalid; contact the operator.'])],
  };
}
