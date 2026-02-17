import 'reflect-metadata'
import { Container } from 'inversify'
import { TOKENS } from './tokens'
import { TypeScriptLanguageService } from '@/typescript/language'
import { TypeScriptServerProbe } from '@/typescript/language'
import { TypeScriptParser } from '@/parser'
import { ThemeColorResolver } from '@/theme'
import { DecorationService } from '@/decoration'
import type { SymbolResolverFactory } from '@/decoration/service'
import { SymbolResolver } from '@/decoration/resolver'

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
