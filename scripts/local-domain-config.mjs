export function localDomainConfig({port,socket,certificate,key}){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid frontend port');
 const quote=value=>JSON.stringify(value);
 return `{
 admin ${quote('unix/'+socket)}
 auto_https off
 servers {
  protocols h1 h2
 }
}
http://offload.ai {
 bind 127.0.0.1 ::1
 redir https://offload.ai{uri} 308
}
https://offload.ai {
 bind 127.0.0.1 ::1
 tls ${quote(certificate)} ${quote(key)}
 reverse_proxy 127.0.0.1:${port}
}
`;
}
