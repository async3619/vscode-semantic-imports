import 'reflect-metadata'
import { Container } from 'inversify'
import { DecorationService } from '@/decoration'
import { SymbolResolver } from '@/decoration/resolver'
import type { SymbolResolverFactory } from '@/decoration/service'
import { TypeScriptParser } from '@/parser'
import { ThemeColorResolver } from '@/theme'
import { TypeScriptLanguageService, TypeScriptServerProbe } from '@/typescript/language'
import { TOKENS } from './tokens'

export function createContainer(): Container {
  const container = new Container()

  container.bind(TypeScriptLanguageService).toSelf().inSingletonScope()
  container.bind(TypeScriptParser).toSelf().inSingletonScope()
  container.bind(ThemeColorResolver).toSelf().inSingletonScope()
  container.bind(TypeScriptServerProbe).toSelf().inSingletonScope()
  container.bind(DecorationService).toSelf().inSingletonScope()

  container
    .bind<SymbolResolverFactory>(TOKENS.SymbolResolverFactory)
    .toFactory(() => (document, targets, languageService) => new SymbolResolver(document, targets, languageService))

  return container
}
